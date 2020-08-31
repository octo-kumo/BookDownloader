const {
    MingRenTeaHouseStrategy
} = require("./strategies");

let downloader = new MingRenTeaHouseStrategy('95800476');
downloader.fetchChapters()
    .then(downloader => downloader.loadChapters(0, 576));
