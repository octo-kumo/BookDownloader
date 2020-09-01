const fs = require('fs');
const gbk = require('gbk');
const fetch = require('node-fetch');
const archiver = require('archiver');
const JSDOM = require('jsdom').JSDOM;

const EXACT_INFO_REGEX = /next_id=(?<next>\d+);\s*bookid=(?<book>\d+);\s*chapterid=(?<chapter>\d+);\s*mybookid=(?<my_book>\d+);/;

const CCTX_REGEX = /var\s*cctxt='([^']+)'/u;
const CHALLENGE_REGEX = /cctxt=cctxt\.replace\(\/(?<victim>[^']+)\/g,'(?<with>[^']+)'\);/ug;

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
        for (let i = start; i < end; i++) {
            let chapter;
            try {
                chapter = fs.existsSync(this.getBookPath() + (i + 1) + ".json") ?
                    JSON.parse(fs.readFileSync(this.getBookPath() + (i + 1) + ".json").toString()) :
                    await this.loadChapter(this.chapterURLs[i]);
            } catch (err) {
                if (this.shouldKeepTrying) {
                    i--;
                    continue;
                } else console.error(err);
            }
            chapter.content = chapter.content.replace(/&nbsp;/g, '');
            fs.writeFileSync(this.getBookPath() + (i + 1) + ".json", JSON.stringify(chapter));
            fs.writeFileSync(this.getBookPath() + (i + 1) + "_" + chapter.chapterName + ".txt", chapter.content);
            archive.append(chapter.content, {name: `${i + 1}_${chapter.chapterName}.txt`});
            process.stdout.write(".");
            count++;
            if (count % 32 === 0) process.stdout.write(`| ${count}/${end - start} #${i + 1}\n`);
        }
        archive.finalize();
    }

    async loadChapter(url) {
        let doc = new JSDOM(await fetch(url).then(res => res.buffer())).window.document;
        let chapterName = doc.getElementById("chaptername").textContent;
        let info = EXACT_INFO_REGEX.exec(doc.head.innerHTML);
        let content = await fetch('https://m.mingrenteahouse.com/files/article/html' + 555 + '/' + Math.floor(info.groups.book / 1000) + '/' + info.groups.book + '/' + info.groups.chapter + '.txt').then(res => res.buffer());
        content = gbk.toString('utf-8', content);
        let match = content.match(CCTX_REGEX);
        let cctx;
        if (match) {
            cctx = match[1];
            let challenge;
            while ((challenge = CHALLENGE_REGEX.exec(content)) !== null) cctx = cctx.replace(new RegExp(challenge.groups.victim, 'g'), challenge.groups.with);
        } else {
            eval(content);
            cctx = cctxt;
        }
        cctx = cctx.replace(/<br\s*\/?>/g, '\n');
        cctx = cctx.replace('&nbsp;', ' ');
        cctx = cctx.replace(/ {2,}/, ' ');
        return {
            url: url,
            chapterName: chapterName,
            content: cctx
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