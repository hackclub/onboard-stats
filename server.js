import "dotenv/config";
import express from "express";
import { Octokit } from "octokit";
import fs from "fs";
import cron from "node-cron";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

const app = express();
const PORT = process.env.PORT || 3030;

const OWNER = "hackclub";
const REPO = "onboard";
const PROJECTS_DIR = "projects";
const HISTORY_FILE = "./commit_history.json";

/**
 * 1) Here is where we read the GitHub token from the environment variable GITHUB_TOKEN:
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("Error: No GITHUB_TOKEN found in environment.");
  process.exit(1);
}
const octokit = new Octokit({ auth: GITHUB_TOKEN });

app.use(express.static("public"));

// Verify GitHub credentials
const verify = async () => {
  try {
    await octokit.rest.users.getAuthenticated();
    return true;
  } catch {
    return false;
  }
};

const fetchPaginatedData = async (method, params, dataKey = "data") => {
  let data = [];
  let page = 1;

  while (true) {
    const response = await method({ ...params, page });
    const items = response[dataKey];
    if (!items || items.length === 0) break;

    data = data.concat(items);
    page++;
  }
  return data;
};

const loadHist = () => {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    } catch (error) {
      console.error(`Error parsing ${HISTORY_FILE}:`, error);
    }
  }
  // Return default structure
  return {
    projects: {}, // commitSha -> { date, subdirsCount }
    pull_requests: {}, // date -> open PR count
    stalled_pull_requests: {}, // date -> stalled PR count
    latestCommitDate: null, // store last commit date processed
    latestPRDate: null, // store last PR creation date processed
  };
};

const saveHist = (histData) => {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(histData, null, 2));
};

// Return the number of subdirectories in PROJECTS_DIR at a given commit sha
const getSubdirCount = async (sha) => {
  try {
    console.log(`Fetching contents of ${PROJECTS_DIR} at commit ${sha}`);
    
    const { data } = await octokit.rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: PROJECTS_DIR,
      ref: sha,
    });
    
    const dirCount = data.filter((item) => item.type === "dir").length;
    console.log(`Found ${dirCount} directories in ${PROJECTS_DIR}`);
    return dirCount;
  } catch (err) {
    console.error(`Error getting subdir count for ${sha}:`, err.message);
    return 0;
  }
};

/**
 * Incremental fetch of new commits since the last known date.
 */
const updateCommits = async (histData) => {
  const since = histData.latestCommitDate || "2024-06-01T00:00:00Z";
  console.log(`Fetching commits since ${since}`);

  const newCommits = await fetchPaginatedData(octokit.rest.repos.listCommits, {
    owner: OWNER,
    repo: REPO,
    per_page: 100,
    since: since,
  });

  let maxDate = dayjs.utc(since);
  
  // Group commits by date
  const commitsByDate = {};
  for (const commit of newCommits) {
    const date = commit.commit.committer.date.split('T')[0];
    // Only keep the last commit of each day
    commitsByDate[date] = commit;
  }

  // Process one commit per day
  for (const [dateStr, c] of Object.entries(commitsByDate)) {
    const { sha } = c;
    const commitDay = dayjs.utc(dateStr);

    // If we don't have data for this day yet
    if (!histData.projects[sha]) {
      console.log(`Getting project count for ${dateStr} (${sha})`);
      const subdirsCount = await getSubdirCount(sha);
      histData.projects[sha] = {
        date: dateStr,
        subdirsCount,
      };
      // Save progress after each day is processed
      saveHist(histData);
    }

    if (commitDay.isAfter(maxDate)) {
      maxDate = commitDay;
    }
  }

  histData.latestCommitDate = maxDate.toISOString();
  saveHist(histData);
};

/**
 * Incremental fetch of new PRs since the last known date.
 * Simple logic to mark some PRs as "stalled" for demonstration,
 * but doesn't do the heavy GraphQL call from the old version.
 */
const updatePRs = async (histData) => {
  const since = histData.latestPRDate || "2024-06-01T00:00:00Z";
  console.log(`Fetching PRs (state=all) since ${since}`);

  const newPRs = await fetchPaginatedData(octokit.rest.pulls.list, {
    owner: OWNER,
    repo: REPO,
    state: "all",
    per_page: 100,
  });
  // Filter out only PRs created after `since`
  const relevantPRs = newPRs.filter((pr) =>
    dayjs.utc(pr.created_at).isAfter(dayjs.utc(since))
  );

  let maxPRDate = dayjs.utc(since);

  const dailyCounts = {};
  const incrementDay = (dayKey, field) => {
    if (!dailyCounts[dayKey]) {
      dailyCounts[dayKey] = { openCount: 0, stalledCount: 0 };
    }
    dailyCounts[dayKey][field]++;
  };

  // Process PRs in smaller batches to save progress
  const BATCH_SIZE = 10;
  for (let i = 0; i < relevantPRs.length; i += BATCH_SIZE) {
    const batch = relevantPRs.slice(i, i + BATCH_SIZE);
    
    for (const pr of batch) {
      const created = dayjs.utc(pr.created_at);
      const closed = pr.closed_at ? dayjs.utc(pr.closed_at) : null;

      if (created.isAfter(maxPRDate)) {
        maxPRDate = created;
      }

      const dateStr = created.format("YYYY-MM-DD");
      incrementDay(dateStr, "openCount");

      const ageDays = dayjs.utc().diff(created, "days");
      if (!closed && ageDays >= 14) {
        incrementDay(dateStr, "stalledCount");
      }
    }

    // Update histData with the current batch
    Object.entries(dailyCounts).forEach(([dayStr, { openCount, stalledCount }]) => {
      if (!histData.pull_requests[dayStr]) {
        histData.pull_requests[dayStr] = 0;
      }
      if (!histData.stalled_pull_requests[dayStr]) {
        histData.stalled_pull_requests[dayStr] = 0;
      }
      histData.pull_requests[dayStr] = openCount;
      histData.stalled_pull_requests[dayStr] = stalledCount;
    });

    // Save progress after each batch
    histData.latestPRDate = maxPRDate.toISOString();
    saveHist(histData);
  }
};

const updateHist = async () => {
  console.log("=== updateHist() invoked ===");
  let histData = loadHist();

  await updateCommits(histData);
  await updatePRs(histData);

  saveHist(histData);
  console.log("=== updateHist() complete ===");
};

// Endpoint for front-end
app.get("/data", (req, res) => {
  const histData = loadHist();
  res.json(histData);
});

// Serve front-end
app.get("/", (req, res) => {
  res.sendFile(path.join(path.resolve(), "public", "index.html"));
});

// 2) Increase the cron job frequency to 4 times a day (00:00, 06:00, 12:00, 18:00):
// The cron pattern "0 0,6,12,18 * * *" means "At minute 0 on hour 0,6,12,18."
cron.schedule("0 0,6,12,18 * * *", async () => {
  await updateHist();
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const isValid = await verify();
  if (!isValid) {
    console.error("Invalid GitHub token. updateHist will not run.");
    process.exit(1);
  }
  // Optionally run update once on startup
  await updateHist();
});