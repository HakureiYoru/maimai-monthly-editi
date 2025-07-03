import { getUserInfoBySlug, getUserPublicInfo, extractSlugFromURL } from 'backend/getUserPublicInfo.jsw';
import wixData from 'wix-data';
import wixUsers from 'wix-users';
import wixWindow from 'wix-window';

let TeamLinks = [];
$w.onReady(function () {
    checkIfUserRegistered();

});

$w.onReady(function () {
    displayTeams(); //用于展示报名队伍+tier
    checkIfUserRegistered();
    loadCurrentUserLink().then(userLink => {
        loadTeammateInfo(userLink).then(teammateData => {
            $w("#table2").rows = teammateData; // 直接设置Table的数据
        }).catch(err => {
            console.error("加载队友信息时出错:", err);
        });
    });

    $w("#button4").onClick(async () => {
        const currentUserId = wixUsers.currentUser.id;
        const teamName = $w("#inputTeamName").value.trim();

        if (!teamName) {
            console.log("请填写队伍名。");
            // 在这里添加用户提示
            return;
        }

        const currentUser = await getUserPublicInfo(currentUserId);
        const currentUserName = currentUser ? currentUser.name : '未知用户';

        const results = await wixData.query("TeamMMFC")
            .eq("_owner", currentUserId).limit(500)
            .find();

        if (results.items.length > 0) {
            console.log("当前用户已经提交过团队信息。");
            $w("#button4").disable();
            $w("#button4").label = "交过了别交了";
        } else {
            if (TeamLinks.length >= 3) {
                // 开始计算所有队员的表现值
                let totalPp = 0;
                for (let link of TeamLinks) {
                    const result = await wixData.query("Team")
                        .eq("website", link).limit(300)
                        .find();
                    if (result.items.length > 0) {
                        totalPp += result.items[0].totalPp;
                    }
                }

                const toInsert = {
                    "creator": currentUserName,
                    "teamname": teamName,
                    "member1": TeamLinks[0],
                    "member2": TeamLinks[1],
                    "Member3": TeamLinks[2],
                    "Total": totalPp, // 添加表现值总和
                };

                wixWindow.openLightbox("TeamConfirmation", { teamName, memberLinks: TeamLinks })
                    .then((action) => {
                        if (action === "confirm") {
                            wixData.insert("TeamMMFC", toInsert)
                                .then((result) => {
                                    console.log("团队信息提交成功", result);
                                    // 成功后的操作
                                })
                                .catch((err) => {
                                    console.error("提交团队信息出错", err);
                                    // 处理错误
                                });
                        }
                        // 如果用户取消，则不执行任何操作
                    });
            } else {
                console.error("TeamLinks 不包含足够的链接");
                // 显示错误消息给用户
            }
        }
    });

});

function checkIfUserRegistered() {
    // 首先查询当前用户是否已经报名
    wixData.query('jobApplication089')
        .eq("_owner", wixUsers.currentUser.id)
        .find()
        .then(results => {
            if (results.items.length > 0) {
                // 用户已经报名
                $w("#button3").label = "报过了";
                $w("#button3").disable(); // 继续保持按钮禁用
            } else {
                // 用户没有报名, 检查总报名人数是否已达到上限
                // checkTotalRegistrations();
                $w("#button3").enable(); // 继续保持按钮禁用
            }
        })
        .catch(err => {
            console.error("检查用户是否报名时出错:", err);
        });
}

function checkTotalRegistrations() {
    // 查询总报名人数
    wixData.query('TeamMMFC')
        .count()
        .then(count => {
            if (count >= 60) {
                // 报名人数已达到170
                $w("#button3").label = "报名已满";
                $w("#button3").disable(); // 禁用按钮
            } else {
                // 报名人数未达到100
                $w("#button3").enable(); // 启用按钮
            }
        })
        .catch(err => {
            console.error("检查总报名人数时出错:", err);
        });
}

function loadTeammateInfo(userLink) {

    // 确保 userLink 不为空
    if (!userLink) {
        console.error("User link is null");
        return Promise.resolve([]); // 返回空数组的Promise
    }
    //wixUsers.currentUser.id
    return wixData.query('jobApplication089')
        .eq("_owner", wixUsers.currentUser.id).limit(800)
        .find()
        .then(async results => {
            if (results.items.length > 0) {
                const currentUser = results.items[0];

                const urls = [currentUser.網址欄2, currentUser.網址欄3]; // 队友的链接

                let promises = urls.map(url => {
                    return extractSlugFromURL(url).then(slug => {
                        return slug ? getUserInfoBySlug(slug) : Promise.resolve(null);
                    });
                });

                let userInfos = await Promise.all(promises);

                // 在这里，我们把当前用户的链接和队友的链接组合起来，存入全局变量 TeamLinks
                TeamLinks = [userLink, ...urls]; // userLink 是当前用户的链接，urls 是队友的链接数组

                let bindingResults = await checkMutualBinding(userLink, urls); // 检查绑定状态

                //检查是否所有的绑定状态都为true
                const allBound = bindingResults.every(result => result.isBound);

                if (allBound) {
                    // 如果所有队友的绑定状态都为true，启用按钮并更新标签为“确认全部绑定并提交”
                    $w("#button4").enable();
                    $w("#button4").label = "确认全部绑定并提交";
                } else {
                    // 如果有任何一个队友的绑定状态不为true，禁用按钮并更新标签为“未全部绑定”
                    $w("#button4").disable();
                    $w("#button4").label = "未全部绑定";
                }

                return userInfos.map((userInfo, index) => {
                    return userInfo ? {
                        image: userInfo.profilePhoto,
                        text: userInfo.nickname,
                        binding: bindingResults[index].isBound ? '已绑定' : '未绑定' // 新增字段表示绑定状态
                    } : {
                        image: '',
                        text: '未找到',
                        binding: '未知' // 如果没有找到userInfo，绑定状态未知
                    };
                });
            } else {
                return [{
                    image: '',
                    text: '没有查询到任何用户信息',
                    binding: '未知'
                }];
            }
        })
        .catch(err => {
            console.error("查询用户信息出错:", err);
            // 使用 err.message 获取具体的错误信息，并在发生错误时返回这个信息
            return [{
                image: '',
                text: `查询过程中发生错误: ${err.message}`, // 显示具体错误内容
                binding: '未知'
            }];
        });

}


export async function checkMutualBinding(userLink, teammateLinks) {
    let bindingStatuses = [];

    for (let teammateLink of teammateLinks) {
        let isBound = false;

        // 查询这个队友是否填写了当前用户的链接在他们的member1或member2
        await wixData.query('jobApplication089')
            .eq("網址欄", teammateLink).limit(300) // 使用队友的slug来定位他们的记录
            .find()
            .then(results => {
                //console.log("查询结果：", results.items);
                for (let result of results.items) {
                    if (result.網址欄2 === userLink || result.網址欄3 === userLink) {
                        isBound = true;

                        break; // 找到一条记录说明他们填写了当前用户的链接
                    }
                }
            });

        bindingStatuses.push({ link: teammateLink, isBound });
    }

    return bindingStatuses; // 返回绑定状态数组
}


// 新函数用于获取当前用户的链接
async function loadCurrentUserLink() {
    const user = await getUserPublicInfo(wixUsers.currentUser.id);
    if (user && user.userslug) {
        return `https://www.maimaimfc.ink/profile/${user.userslug}/profile`;
    } else {
        // 处理没有找到用户slug的情况
        console.error("未找到用户的slug");
        return null;
    }
}

async function displayTeams() {
    try {
        const results = await wixData.query('TeamMMFC').limit(500)
            .find();

        const teamsData = results.items.map(team => {
            return {
                "teamname": team.teamname, // 直接展示团队名
                "Total": categorizeTotal(team.Total) // 根据 Total 值分类
            };
        });

        $w("#table3").rows = teamsData;
    } catch (err) {
        console.error("Error fetching teams data:", err);
    }
}

function categorizeTotal(total) {
    if (total >= 750) {
        return "T0";
    } else if (total >= 500) {
        return "T1";
    } else if (total >= 150) {
        return "T2";
    } else {
        return "T3";
    }
}

$w('#input9').onChange((event) => {
    checkIfUserRegistered();
})

$w('#input7').onChange((event) => {
    checkIfUserRegistered();
})

$w('#radioGroup1').onChange((event) => {
    checkIfUserRegistered();
})