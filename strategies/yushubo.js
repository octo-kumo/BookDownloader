const fs = require('fs');
const fetch = require('node-fetch');
const archiver = require('archiver');
const JSDOM = require('jsdom').JSDOM;

class YuShuBo {
    constructor(bookId) {
        this.strategy = "YuShuBo";
        this.bookId = bookId;
        this.menuURL = `https://m.yushubo.com/book_${bookId}.html`;
        this.chapterURLs = [];
        this.bookName = null;

        if (fs.existsSync(this.getPath())) {
            let cache = JSON.parse(String(fs.readFileSync(this.getPath())));
            if (this.strategy !== cache.strategy) throw "Strategy do not match!";
            if (this.bookId !== cache.bookId) throw "BookID do not match";
            this.bookName = cache.bookName;
            this.chapterURLs = cache.chapterURLs;
            this.finishedLoading = cache.finishedLoading;
            console.debug(`Loaded ${this.chapterURLs.length} chapters from cache`);
        }
    }

    async fetchChapters() {
        if (this.finishedLoading) {
            console.debug("All chapters were already loaded. Skipping loading.");
            return this;
        }
        let doc = new JSDOM(await fetch(this.menuURL).then(res => res.buffer())).window.document;
        this.bookName = doc.querySelector(".book-info h2").textContent.trim();
        for (let elem of doc.querySelectorAll("#ul1 #chapter a")) {
            let url = "https://m.yushubo.com" + elem.href;
            if (!this.chapterURLs.includes(url)) this.chapterURLs.push(url);
        }
        console.debug(`\tLoaded ${this.chapterURLs.length} chapters`);
        fs.writeFileSync(this.getPath(), JSON.stringify(this));
        this.finishedLoading = true;
        return this;
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
        for (let i = start; i < end; i++) try {
            process.stdout.write("\n");
            let chapter = fs.existsSync(this.getBookPath() + (i + 1) + ".json") ?
                JSON.parse(fs.readFileSync(this.getBookPath() + (i + 1) + ".json").toString()) :
                await this.loadChapter(this.chapterURLs[i]);
            chapter.content = chapter.content.replace(/&nbsp;/g, ' ').replace(/ {2,}/g, ' ').replace(/\n +/g, '\n');
            fs.writeFileSync(this.getBookPath() + (i + 1) + ".json", JSON.stringify(chapter));
            archive.append(chapter.chapterName + "\n\n" + chapter.content, {name: `${chapter.chapterName}.txt`});
            process.stdout.cursorTo(count % 32, 2);
            process.stdout.write(".");
            count++;
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
        await archive.finalize();
    }

    async loadChapter(url) {
        process.stdout.clearLine();
        process.stdout.write(`Loading...\n`);
        process.stdout.clearLine();
        process.stdout.write(`- url = ${url}\n`);
        let doc = new JSDOM(await fetch(url).then(res => res.buffer())).window.document;
        let ndoc = new JSDOM(await fetch(url.replace('.html', '_2.html')).then(res => res.buffer())).window.document;
        let chapterName = doc.querySelector("#readContent h3").textContent.replace(/\(\d\/\d\)/, '').trim()
        process.stdout.clearLine();
        process.stdout.write(`- name = ${chapterName}\n`);
        return {
            url: url,
            chapterName: chapterName,
            content: this.getContent(doc) + "\n" + this.getContent(ndoc)
        };
    }

    getContent(doc) {
        return Array.from(doc.querySelectorAll("#readContent .read-section>p")).map(e => e.textContent.trim()).filter(s => s).join("\n");
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

module.exports = YuShuBo;