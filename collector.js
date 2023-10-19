const { readFileSync, writeFileSync } = require('fs');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const jsdom = require('jsdom');
let currentId = parseInt(readFileSync('cid.txt').toString());

require('dotenv').config();

const collect = async (id) => {
    return new Promise(async(resolve, reject) => {
        const { JSDOM } = jsdom;
        const data = await fetch(`https://www.dit.uoi.gr/news.php?sa=view_new&id=${id}`).then((res) => res.text());

        //? Parse DOM, and extract relevant elements
        const dom = new JSDOM(data);

        const title = dom.window.document.querySelector('.title').textContent;
        const content = NodeHtmlMarkdown.translate(dom.window.document.querySelector('.col-lg-12').innerHTML, {
            maxConsecutiveNewlines: 2,
            ignore: ['hr', 'img']
        });

        //? Handle non-existent announcement ID
        title.includes('δεν βρέθηκε') ? reject(404) : resolve({title: title, content: content});
    })
}
const init = async () => {
    let isOk = true;
    let isOkCount = 0;
    let tempId = currentId;

    while (isOk) {
        console.log(`Trying announcement ID ${tempId+1}`)
        await collect(tempId+1).then(async (res) => {
            tempId++;
            console.log(`ID ${tempId} success, ${res.title}, posting webhook..`);
            console.log(res.content);

            await fetch(process.env.WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: `## Νέα ανακοίνωση τμήματος\n## Τίτλος: **${res.title}**\n\n${res.content}\n\n*Διαβάστε την ανακοίνωση [στην σελίδα του τμήματος](https://www.dit.uoi.gr/news.php?sa=view_new&id=${tempId})*`
                })
            })
        }).catch((err) => {
            //* Retry mechanism. If 3 consecutive IDs fail, save the last successful ID and exit.
            //* This is needed because the announcement IDs are not always sequential - some announcements
            //* can be deleted.

            console.log(`ID ${(tempId - isOkCount)+1} fail, err ${err}`);
            if (isOkCount <= 2) {
                tempId++;
                isOkCount++;
            } else {
                writeFileSync('cid.txt', (tempId - isOkCount).toString());
                process.exit();
            }
        })
    }
}

init();