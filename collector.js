const { readFileSync, writeFileSync } = require('fs');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const jsdom = require('jsdom');
const fetch = require('node-fetch');

let currentId = parseInt(readFileSync('/opt/node/ditannouncements/cid.txt').toString());

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

    let toBeSent = [];
    while (isOk) {
        console.log(`Trying announcement ID ${tempId+1}`)
        await collect(tempId+1).then(async (res) => {
            tempId++;
            console.log(`ID ${tempId} success, ${res.title}, posting webhook..`);
            console.log(res.content);

            let metadata = res.content.split('---')[0].split('\n');
            let fields = []
            metadata.forEach((field) => {
                if (field.includes('Καταχωρήθηκε')) fields.push({name: 'Καταχωρήθηκε:', value: field.split(':** ')[1].trim(), inline: true})
                else if (field.includes('Τελευταία ενημέρωση')) fields.push({name: 'Τελευταία ενημέρωση:', value: field.split(':** ')[1].trim(), inline: true})
                else if (field.includes('Ημερομηνία λήξης')) fields.push({name: 'Ημερομηνία λήξης:', value: field.split(':** ')[1].trim(), inline: true})
                else if (field.includes('Κατηγορία')) fields.push({name: 'Κατηγορία:', value: field.split(':** ')[1].trim(), inline: true})
            })

            fields.push({name: '\u200B', value: res.content.split('---')[1].trim()});
            toBeSent.push({
                "content": "@everyone",
                "embeds": [
                    {
                        "type": "rich",
                        "title": `Νέα ανακοίνωση τμήματος`,
                        "description": `Τίτλος: ${res.title}`,
                        "color": 0x00FFFF,
                        "fields": fields,
                        "url": `https://www.dit.uoi.gr/news.php?sa=view_new&id=${tempId}`,
                        "footer": {
                            "text": "Announcement webhook by @ComradeTurtle"
                        }
                    }
                ]
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
                isOk = false;
            }
        })
    }

    // toBeSent.reverse();
    for (const an of toBeSent) {
        await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(an)
        }).catch((err) => console.log(err))
    }
    process.exit();
}

init();
