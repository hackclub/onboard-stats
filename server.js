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

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const { OWNER, REPO, PROJECTS_DIR, HISTORY_FILE } = process.env;
app.use(express.static("public"));

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
    for (let page = 1; ; page++) {
        const { [dataKey]: items } = await method({ ...params, page });
        if (!items.length) break;
        data = [...data, ...items];
    }
    return data;
};

const getCommits = () =>
    fetchPaginatedData(octokit.rest.repos.listCommits, {
        owner: OWNER,
        repo: REPO,
        per_page: 100,
    });

const getPRsByDate = async (date) => {
    const targetDay = dayjs.utc(date);
    const nextDay = targetDay.add(1, "day");

    const prs = await fetchPaginatedData(octokit.rest.pulls.list, {
        owner: OWNER,
        repo: REPO,
        state: "all",
        per_page: 100,
    });

    return prs.filter(({ created_at, closed_at }) => {
        const createdAt = dayjs.utc(created_at);
        const closedAt = closed_at ? dayjs.utc(closed_at) : null;
        return createdAt.isBefore(nextDay) && (!closedAt || closedAt.isAfter(targetDay));
    }).length;
};

const getSubdirCount = async (sha) => {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: PROJECTS_DIR,
            ref: sha,
        });
        return data.filter(({ type }) => type === "dir").length;
    } catch {
        return 0;
    }
};

const loadHist = () => {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
        } catch (error) {
            console.error(`Error parsing ${HISTORY_FILE}:`, error);
        }
    }
    return { projects: {}, prs: {}, stalled: {} };
};

const saveHist = (histData) => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(histData, null, 4));
};

const fetchPRDetails = async (prNumber) => {
    try {
        const result = await octokit.graphql(
            `
            query PullRequestByNumber($owner: String!, $repo: String!, $pr_number: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $pr_number) {
                        comments(first: 100) {
                            nodes {
                                id
                                author {
                                    login
                                }
                                createdAt
                            }
                        }
                        reviews(first: 100) {
                            nodes {
                                id
                                author {
                                    login
                                }
                                createdAt
                            }
                        }
                    }
                }
            }
        `,
            { owner: OWNER, repo: REPO, pr_number: prNumber }
        );
        return result.repository.pullRequest;
    } catch (error) {
        console.error(`Error fetching PR details for PR #${prNumber}: ${error.message}`);
        return null;
    }
};

const wasStalledPR = async (pr, checkDate) => {
    const hasDevLabel = pr.labels.some(({ name }) => name.toLowerCase() === "dev");
    if (hasDevLabel) return false;

    const prDetails = await fetchPRDetails(pr.number);
    if (!prDetails) return false;

    const { comments, reviews } = prDetails;
    if (!comments.nodes.length && !reviews.nodes.length) return false;

    const sevenDaysAgo = dayjs.utc(checkDate).subtract(7, "days");
    const allComments = [...comments.nodes, ...reviews.nodes].filter(({ createdAt }) =>
        dayjs.utc(createdAt).isBefore(sevenDaysAgo)
    );

    if (!allComments.length) return false;

    const authorReplies = allComments.some(({ id, author: { login } }) =>
        allComments.some(
            ({ in_reply_to_id, author }) => in_reply_to_id === id && author.login === pr.user.login
        )
    );

    return !authorReplies;
};

const getStalledPRsByDate = async (date) => {
    const targetDay = dayjs.utc(date);
    const nextDay = targetDay.add(1, "day");

    const prs = await fetchPaginatedData(octokit.rest.pulls.list, {
        owner: OWNER,
        repo: REPO,
        state: "all",
        per_page: 100,
    });

    const stalledPRs = await Promise.all(
        prs.filter(({ created_at, closed_at }) => {
            const createdAt = dayjs.utc(created_at);
            const closedAt = closed_at ? dayjs.utc(closed_at) : null;
            return createdAt.isBefore(nextDay) && (!closedAt || closedAt.isAfter(targetDay));
        }).map(async (pr) => {
            const wasStalled = await wasStalledPR(pr, date);
            return wasStalled ? pr.number : null;
        })
    );

    return stalledPRs.filter(Boolean).length;
};

const updateHist = async () => {
    console.log("Updating history");
    let histData = loadHist();

    if (!histData.projects) histData.projects = {};
    if (!histData.pull_requests) histData.pull_requests = {};
    if (!histData.stalled_pull_requests) histData.stalled_pull_requests = {};

    const commits = await getCommits();
    commits.reverse();

    for (const { sha, commit: { committer: { date: commitDate } } } of commits) {
        const date = commitDate.split('T')[0];

        if (!histData.projects[sha]) {
            console.log(`Fetching subdir count for ${sha}`);
            const subdirsCount = await getSubdirCount(sha);
            histData.projects[sha] = { date, subdirsCount };
        }
    }

    const startDate = dayjs.utc("2024-06-01");
    const endDate = dayjs.utc().endOf('day');
    let date = startDate;

    while (date.isBefore(endDate)) {
        const dateString = date.format("YYYY-MM-DD");
        const isToday = date.isSame(dayjs.utc(), 'day');
        if (!histData.pull_requests[dateString] || isToday) {
            console.log(`Fetching PRs for ${dateString}`);
            const prCount = await getPRsByDate(dateString);
            histData.pull_requests[dateString] = prCount;
            console.log(histData.pull_requests[dateString]);
        }
        if (!histData.stalled_pull_requests[dateString] || isToday) {
            console.log(`Fetching stalled PRs for ${dateString}`);
            const stalledCount = await getStalledPRsByDate(dateString);
            histData.stalled_pull_requests[dateString] = stalledCount;
            console.log(histData.stalled_pull_requests[dateString]);
        }
        date = date.add(1, 'day');
    }

    saveHist(histData);
};

app.get("/data", (req, res) => {
    const histData = loadHist();
    res.json(histData);
});

cron.schedule("*/15 * * * *", async () => {
    await updateHist();
});

app.get("/", (req, res) => {
    res.sendFile(path.join(path.resolve(), "public", "index.html"));
});

app.listen(PORT, async () => {
    const isValid = await verify();
    if (isValid) {
        await updateHist();
    } else {
        console.error("Invalid GitHub token. updateHist will not run.");
        process.exit();
    }
});
