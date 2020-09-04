const {
    QingGoo,
    MingRenTeaHouseStrategy
} = require("./strategies");
new QingGoo("5d92f399f71a514eb0dcf435")
    .fetchChapters()
    .then(downloader => downloader.loadChapters())
    .catch(console.error);
// new MingRenTeaHouseStrategy('1')
//     .fetchChapters()
//     .then(downloader => downloader.loadChapters());