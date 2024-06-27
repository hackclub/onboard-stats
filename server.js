require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.OWNER;
const REPO = process.env.REPO;
const PROJECTS_DIR = process.env.PROJECTS_DIR;
const HISTORY_FILE = process.env.HISTORY_FILE;
app.use(express.static('public'));

const getHeaders = () => ({
    headers: {
        Authorization: `token ${GITHUB_TOKEN}`
    }
});

const verifyToken = async () => {
    try {
        await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`
            }
        });
        return true;
    } catch {
        return false;
    }
};

const getCommits = async () => {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/commits`;
    let commits = [];
    console.log("begin getCommits");
    while (url) {
        const response = await axios.get(url, getHeaders());
        commits = commits.concat(response.data);
        url = response.headers.link && response.headers.link.includes('rel="next"')
            ? response.headers.link.split(';')[0].slice(1, -1)
            : null;
    }
    console.log("end getCommits");
    return commits;
};

const getSubdirectoriesCountAtCommit = async (commit_sha) => {
    console.log("begin getSubdirectoriesCountAtCommit");
    try {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PROJECTS_DIR}?ref=${commit_sha}`;
        const response = await axios.get(url, getHeaders());
        console.log("end getSubdirectoriesCountAtCommit");
        return response.data.filter(item => item.type === 'dir').length;
    } catch (error) {
        console.log("error getSubdirectoriesCountAtCommit");
        return 0;
    }
};

const getOpenPullRequestsCount = async () => {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/pulls?state=open`;
    let openCount = 0;
    let stalledCount = 0;
    console.log("begin getOpenPullRequestsCount");
    while (url) {
        const response = await axios.get(url, getHeaders());
        openCount += response.data.length;
        response.data.slice(0, openCount).forEach(item => {
            if (new Date(item.created_at) < new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)) {
                stalledCount++;
            }
        });
        url = response.headers.link && response.headers.link.includes('rel="next"')
            ? response.headers.link.split(';')[0].slice(1, -1)
            : null;
    }
    console.log("end getOpenPullRequestsCount");
    openCount -= stalledCount;
    return [openCount, stalledCount];
};

const updateHistory = async () => {
    console.log("begin updateHistory");
    let historyData = { projects: {}, pull_requests: {}, stalled_pull_requests: {} };
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
            if (!historyData.projects) {
                historyData = { projects: {}, pull_requests: {} };
            }
        } catch (error) {
            console.error(`Error parsing ${HISTORY_FILE}:`, error);
        }
    }
    const commits = await getCommits();

    for (const commit of commits) {
        const sha = commit.sha;
        const date = commit.commit.committer.date;
        if (!historyData.projects[sha]) {
            const subdirsCount = await getSubdirectoriesCountAtCommit(sha);
            historyData.projects[sha] = { date, subdirsCount };
        }
    }

    const openPullRequestsCount = await getOpenPullRequestsCount();
    const today = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
    historyData.pull_requests[today] = openPullRequestsCount[0];
    historyData.stalled_pull_requests[today] = openPullRequestsCount[1];

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 4));
    console.log("end updateHistory");
};

app.get('/data', (req, res) => {
    console.log("begin app.get");
    const historyData = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : { projects: {}, pull_requests: {}, stalled_pull_requests: {} };
    res.json(historyData);
    console.log("end app.get");
});

cron.schedule('*/15 * * * *', async () => {
    console.log('Updating history...');
    await updateHistory();
    console.log('History updated.');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    const isTokenValid = await verifyToken();
    if (isTokenValid) {
        await updateHistory();
    } else {
        console.error("Server started, but GitHub token is invalid. updateHistory will not run.");
        process.exit();
    }
    console.log("end listen");
});