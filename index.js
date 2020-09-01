const {
    MingRenTeaHouseStrategy
} = require("./strategies");

let downloader = new MingRenTeaHouseStrategy('1');
downloader
    .keepTrying()
    .fetchChapters()
    .then(downloader => downloader.loadChapters(0, 1087));