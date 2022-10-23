const fs = require('fs');
const archiver = require('archiver');
const NodeFetchQueue = require("../utils/FetchQueue");
const JSDOM = require('jsdom').JSDOM;

const queue = new NodeFetchQueue()
queue.resize(20);

async function getChapter(name, url) {
    const doc = new JSDOM(await queue.fetch(url).then(res => res.buffer())).window.document;
    let file = `./books/Spy✕Family/${name}.cbr`;
    const images = Array.from(doc.querySelectorAll('meta[property="twitter:image"]')).map(m=>m.content);
    const output = fs.createWriteStream(file);
    const archive = archiver('zip', {
        zlib: {level: 9}
    });
    archive.pipe(output);

    await Promise.all(Array.from(images).map(image => queue.fetch(image).then(res => res.buffer()).then(buf => {
        process.stdout.write(".");
        archive.append(buf, {name: image.substring(image.lastIndexOf('/') + 1)});
    })));
    console.log(" Done");
    await archive.finalize();
}

async function start() {
    if (!fs.existsSync("./books/Spy✕Family")) fs.mkdirSync("./books/Spy✕Family");
    let doc = new JSDOM(await queue.fetch("https://spy-xfamily.com/").then(res => res.buffer())).window.document;
    let ts = Array.from(doc.querySelectorAll("#ceo_latest_comics_widget-3 ul li a"));
    await Promise.all(Array.from(ts).map(a => getChapter(a.textContent.trim(), a.getAttribute('href'))))
    console.log("All Done")
}

start().catch(e => console.log(e));