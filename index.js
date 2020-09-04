const {
    MingRenTeaHouseStrategy
} = require("./strategies");
new MingRenTeaHouseStrategy('1')
    .fetchChapters()
    .then(downloader => downloader.loadChapters());