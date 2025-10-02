import wixData from 'wix-data';
import wixUsers from 'wix-users';

$w.onReady(function () {
    checkIfUserRegistered();
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
                $w("#button3").disable();
            } else {
                // 用户没有报名, 检查总报名人数是否已达到上限
                checkTotalRegistrations();
            }
        })
        .catch(err => {
            console.error("检查用户是否报名时出错:", err);
        });
}

function checkTotalRegistrations() {
    // 查询总报名人数
    wixData.query('jobApplication089')
        .count()
        .then(count => {
            if (count >= 250) {
                // 报名人数已达到上限
                $w("#button3").label = "报名已满";
                $w("#button3").disable();
            } else {
                // 报名人数未达到上限
                $w("#button3").enable();
            }
        })
        .catch(err => {
            console.error("检查总报名人数时出错:", err);
        });
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