const fs = require('fs');
const archiver = require('archiver');
const NodeFetchQueue = require("../utils/FetchQueue");
const JSDOM = require('jsdom').JSDOM;

const queue = new NodeFetchQueue()
queue.resize(20);
const url = "https://onepunch-manga.com/";

async function getChapter(name, url) {
    let file = `./books/OnePunchMan/${name}.cbr`;
    console.log(name, url);
    const doc = new JSDOM(await queue.fetch(url).then(res => res.buffer())).window.document;

    const images = doc.querySelectorAll(".separator img, .wp-block-image img");
    const output = fs.createWriteStream(file);
    const archive = archiver('zip', {
        zlib: {level: 9}
    });
    archive.pipe(output);

    await Promise.all(Array.from(images).map(img => img.getAttribute("src")).map(image => queue.fetch(image).then(res => res.buffer()).then(buf => {
        process.stdout.write(".");
        archive.append(buf, {name: image.substring(image.lastIndexOf('/') + 1)});
    })));
    console.log(" Done");
    await archive.finalize();
}

async function start() {
    if (!fs.existsSync("./books/OnePunchMan")) fs.mkdirSync("./books/OnePunchMan");
    let doc = new JSDOM(await queue.fetch(url).then(res => res.buffer())).window.document;
    let ts = Array.from(doc.querySelectorAll("#main .su-post>a"));
    await Promise.all(Array.from(ts).map(a => getChapter(a.textContent.trim(), a.getAttribute('href'))))
    console.log("All Done")
}

start().catch(e => console.log(e));