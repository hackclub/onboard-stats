import 'dotenv/config';
import express from 'express';
import { Octokit } from 'octokit';
import fs from 'fs';
import cron from 'node-cron';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3030;

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const { OWNER, REPO, PROJECTS_DIR, HISTORY_FILE } = process.env;
app.use(express.static('public'));

const verify = async () => {
    try {
        await octokit.rest.users.getAuthenticated();
        return true;
    } catch {
        return false;
    }
};

const fetchCommits = async () => {
    let commits = [];
    let page = 1;
    while (true) {
        const { data } = await octokit.rest.repos.listCommits({ owner: OWNER, repo: REPO, per_page: 100, page });
        if (data.length === 0) break;
        commits = commits.concat(data);
        page++;
    }
    return commits;
};

const fetchPRsByDate = async (date) => {
    const query = `repo:${OWNER}/${REPO} type:pr state:open created:<=${date}`;
    const { data } = await octokit.rest.search.issuesAndPullRequests({ q: query });
    return data.total_count;
};

const fetchSubdirCount = async (sha) => {
    try {
        const { data } = await octokit.rest.repos.getContent({ owner: OWNER, repo: REPO, path: PROJECTS_DIR, ref: sha });
        return data.filter(item => item.type === 'dir').length;
    } catch {
        return 0;
    }
};

const fetchOpenPRCounts = async () => {
    let openCount = 0, stalledCount = 0, page = 1;
    while (true) {
        const { data } = await octokit.rest.pulls.list({ owner: OWNER, repo: REPO, state: 'open', per_page: 100, page });
        if (data.length === 0) break;
        openCount += data.length;
        stalledCount += data.filter(pr => pr.labels.some(label => label.name.toLowerCase() === 'stalled')).length;
        page++;
    }
    return [openCount, stalledCount];
};

const loadHistory = () => {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        } catch (error) {
            console.error(`Error parsing ${HISTORY_FILE}:`, error);
        }
    }
    return { projects: {}, prs: {} };
};

const saveHistory = (histData) => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(histData, null, 4));
};

const updateHist = async () => {
    let histData = loadHistory();

    const commits = await fetchCommits();
    for (const commit of commits) {
        const sha = commit.sha;
        const date = commit.commit.committer.date.split('T')[0];
        if (!histData.projects[sha]) {
            console.log("here")
            const subdirCount = await fetchSubdirCount(sha);
            histData.projects[sha] = { date, subdirCount };
        }
        if (!histData.prs[date]) {
            const openPRCount = await fetchPRsByDate(date);
            histData.prs[date] = openPRCount;
        }
    }

    saveHistory(histData);
};

app.get('/data', (req, res) => {
    const histData = loadHistory();
    res.json(histData);
});

cron.schedule('*/15 * * * *', async () => {
    await updateHist();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(path.resolve(), 'public', 'index.html'));
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
