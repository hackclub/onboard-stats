const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3119;

const GITHUB_TOKEN = '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';
const OWNER = 'hackclub';
const REPO = 'onboard';
const PROJECTS_DIR = 'projects';
const HISTORY_FILE = 'commit_history.json';

app.use(express.static('public'));

const getHeaders = () => ({
    headers: {
        Authorization: `token ${GITHUB_TOKEN}`
    }
});

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
    console.log("begin getOpenPullRequestsCount");
    while (url) {
        const response = await axios.get(url, getHeaders());
        openCount += response.data.length;
        url = response.headers.link && response.headers.link.includes('rel="next"')
            ? response.headers.link.split(';')[0].slice(1, -1)
            : null;
    }
    console.log("end getOpenPullRequestsCount");
    return openCount;
};

const updateHistory = async () => {
    console.log("begin updateHistory");
    let historyData = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : { projects: {}, pull_requests: {} };
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
    historyData.pull_requests[today] = openPullRequestsCount;

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 4));
    console.log("end updateHistory");
};

app.get('/data', (req, res) => {
    console.log("begin app.get");
    const historyData = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : { projects: {}, pull_requests: {} };
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    updateHistory(); // Initial call to update history
    console.log("end listen");
});
