const fs = require('fs');
const gbk = require('gbk');
const fetch = require('node-fetch');
const archiver = require('archiver');
const JSDOM = require('jsdom').JSDOM;
const safeEval = require('safe-eval');

const EXACT_INFO_REGEX = /next_id=(?<next>\d+);\s*bookid=(?<book>\d+);\s*chapterid=(?<chapter>\d+);\s*mybookid=(?<my_book>\d+);/;

class MingRenTeaHouseStrategy {
    constructor(bookId) {
        this.strategy = "MingRenTeaHouse";
        this.bookId = bookId;
        this.menuURL = `https://m.mingrenteahouse.com/shu/${bookId}.html`;
        this.chapterURLs = [];
        this.bookName = null;

        if (fs.existsSync(this.getPath())) {
            let cache = JSON.parse(String(fs.readFileSync(this.getPath())));
            if (this.strategy !== cache.strategy) throw "Strategy do not match!";
            if (this.bookId !== cache.bookId) throw "BookID do not match";
            this.bookName = cache.bookName;
            this.chapterURLs = cache.chapterURLs;
            this.lastCachedPage = cache.lastCachedPage;
            this.finishedLoading = cache.finishedLoading;
            console.debug(`Loaded ${this.chapterURLs.length} chapters from cache`);
        }
    }

    async fetchChapters(page = 1) {
        if (this.finishedLoading) {
            console.debug("All chapters were already loaded. Skipping loading.");
            return this;
        }
        if (this.lastCachedPage && page !== this.lastCachedPage) {
            console.debug("Skipping to last stopped page", this.lastCachedPage);
            return await this.fetchChapters(this.lastCachedPage);
        }

        console.debug("Page URL:", `${this.menuURL}?page=${page}`);
        let doc = new JSDOM(await fetch(`${this.menuURL}?page=${page}`).then(res => res.buffer())).window.document;

        if (page === 1 || !this.bookName) this.bookName = doc.getElementsByClassName("bookname")[0].textContent.trim();
        let pages = doc.getElementsByClassName("pagebox")[0].getElementsByTagName("option");
        let hasNextChapter = true;
        if (page === pages.length) hasNextChapter = false;
        let chapters = doc.querySelectorAll(".block-box:nth-child(12)>.chapter-list>li>a");

        console.debug(`\tPage ${page}: ${pages[page - 1].textContent}: ${chapters.length} chapters`);
        for (let chapter of chapters) {
            let url = `https://m.mingrenteahouse.com${chapter.href}`;
            if (!this.chapterURLs.includes(url)) this.chapterURLs.push(url);
        }

        this.lastCachedPage = page + 1;
        fs.writeFileSync(this.getPath(), JSON.stringify(this));
        if (hasNextChapter) return await this.fetchChapters(page + 1);
        else {
            console.log(`Loaded all pages with total of ${this.chapterURLs.length} chapters`);
            this.finishedLoading = true;
            fs.writeFileSync(this.getPath(), JSON.stringify(this));
            return this;
        }
    }

    async loadChapters(start = 0, end) {
        process.stdout.cursorTo(0, 0);
        process.stdout.clearLine();
        if (!this.finishedLoading) throw("Chapters are not fully loaded yet");
        if (!fs.existsSync(this.getBookPath())) fs.mkdirSync(this.getBookPath());
        console.debug("Loading Chapters");
        const output = fs.createWriteStream('./books/' + this.bookName + '.zip');
        const archive = archiver('zip', {zlib: {level: 9}});
        output.on('close', () => console.log(`${archive.pointer()} total bytes\n\t archiver has been finalized and the output file descriptor has closed.`));
        output.on('end', () => console.log('Data has been drained'));
        archive.pipe(output);
        end = end || this.chapterURLs.length;
        console.debug(`zipping from ${start} to ${end}`);
        let count = 0;
        process.stdout.clearLine();
        let job_at_once = 8;
        let jobs_cache = [];
        for (let i = start; i < end; i++) try {
            if (jobs_cache.length < job_at_once) {
                jobs_cache.push(this.loadChapter(i, this.chapterURLs[i]));
                continue;
            }
            process.stdout.write("\n");
            let chapters = await Promise.all(jobs_cache);
            chapters.forEach(chapter => {
                fs.writeFileSync(this.getBookPath() + (chapter.index + 1) + ".json", JSON.stringify(chapter));
                archive.append(chapter.chapterName + "\n\n" + chapter.content, {name: `${chapter.index + 1}_${chapter.chapterName}.txt`});
                process.stdout.cursorTo(count % 32, 2);
                process.stdout.write(".");
                count++;
            });
            jobs_cache = [];
            process.stdout.cursorTo(32);
            process.stdout.write(`| ${count}/${end - start} #${i + 1}`);
            if (count % 32 === 0) process.stdout.clearLine();
        } catch (err) {
            if (this.shouldKeepTrying) i--;
            else {
                console.log("\n");
                console.log("Index = " + i);
                console.log("Error URL = " + this.chapterURLs[i]);
                console.log(err);
                process.exit(0);
            }
        }
        archive.finalize();
    }

    async loadChapter(index, url) {
        if (fs.existsSync(this.getBookPath() + (index + 1) + ".json")) return JSON.parse(fs.readFileSync(this.getBookPath() + (index + 1) + ".json").toString());
        process.stdout.clearLine();
        process.stdout.write(`Loading...\n`);
        process.stdout.clearLine();
        process.stdout.write(`- url = ${url}\n`);
        let doc = new JSDOM(await fetch(url).then(res => res.buffer())).window.document;
        let chapterName = doc.getElementById("chaptername").textContent;
        let info = EXACT_INFO_REGEX.exec(doc.head.innerHTML);
        let content_url = 'https://m.mingrenteahouse.com/files/article/html' + 555 + '/' + Math.floor(info.groups.book / 1000) + '/' + info.groups.book + '/' + info.groups.chapter + '.txt';
        process.stdout.clearLine();
        process.stdout.write(`- name = ${chapterName}\n`);
        process.stdout.clearLine();
        process.stdout.write(`- content url = ${content_url}\n`);
        process.stdout.clearLine();

        let content = gbk.toString('utf-8', await fetch(content_url).then(res => res.buffer()));
        content = safeEval("(function() {\n" + content + "\nreturn cctxt;})()", {
            window: {},
            atob: text => Buffer.from(text, 'base64').toString('binary'),
            btoa: text => Buffer.from(text, 'binary').toString('base64')
        });
        content = content.replace(/<br\s*\/?>/g, '\n');
        content = content.replace(/&nbsp;/g, ' ');
        content = content.replace(/ {2,}/, ' ');
        content = content.trim();
        process.stdout.moveCursor(0, -4);
        return {
            url: url,
            index: index,
            chapterName: chapterName,
            content: content
        };
    }


    getPath() {
        return `./cache/${this.strategy}.${this.bookId}.chapters.json`;
    }

    getBookPath() {
        return `./cache/${this.strategy}.${this.bookId}.chapters/`;
    }

    keepTrying() {
        this.shouldKeepTrying = !this.shouldKeepTrying;
        return this;
    }

}

module.exports = MingRenTeaHouseStrategy;