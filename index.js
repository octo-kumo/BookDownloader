const {
    QingGoo,
    MBText,
    YuShuBo,
    MingRenTeaHouseStrategy
} = require("./strategies");
// new QingGoo("5d92f399f71a514eb0dcf435")
//     .fetchChapters()
//     .then(downloader => downloader.loadChapters())
//     .catch(console.error);
// new MingRenTeaHouseStrategy('1')
//     .keepTrying()
//     .fetchChapters()
//     .then(downloader => downloader.loadChapters());
// new MBText("73137")
//     .fetchChapters()
//     .then(downloader => downloader.loadChapters())
//     .catch(console.error);
new YuShuBo("40613")
    .fetchChapters()
    .then(downloader => downloader.loadChapters())
    .catch(console.error)