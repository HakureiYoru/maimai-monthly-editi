import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { getCurrentMemberRoles } from 'backend/auditorManagement.jsw';
import { getUserInfoBySlug, getUserPublicInfo } from 'backend/getUserPublicInfo.jsw';
import { getFileDownloadUrlAndContent } from 'backend/mediaManagement.jsw'; // 确保导入函数
import { fetch } from 'wix-fetch';

async function isAdmin() {
    if (wixUsers.currentUser.loggedIn) {
        const userRoles = await getCurrentMemberRoles();
        return userRoles.some(role => role.title === 'Admin');
    }
    return false;
}

$w.onReady(async function () {
    const isUserAdmin = await isAdmin(); // 检查用户是否是海选组成员
    const currentUserId = wixUsers.currentUser.id;
    checkIfUserRegistered();
    if (isUserAdmin) {
        $w("#button1").enable();
        $w("#button1").label = "提交（管理员）";
    } else {
        wixData.query("enterContest034")
            .eq("_owner", currentUserId).limit(300)
            .find()
            .then((results) => {
                if (results.items.length > 0) {
                    $w("#button1").disable();
                    $w("#button1").label = "禁止重复提交";
                } else {
                    // 检查用户是否报名
                    
                }
            })
            .catch((err) => {
                console.error("查询失败：", err);
            });
    }

    $w("#uploadButton2").onChange(() => {
  $w("#uploadButton2").uploadFiles()
    .then((uploadedFiles) => {
      if (uploadedFiles.length > 0) {
        const uploadedFile = uploadedFiles[0];
        const fileUrl = uploadedFile.fileUrl;  // 获取文件的 URL

        // 调用后端函数获取文件内容
        getFileDownloadUrlAndContent(fileUrl)
          .then(({ downloadUrl, fileContent }) => {
            const descriptionMatch = fileContent.match(/&des=([^&\n\r]+)/);
            let formattedText;
             if (descriptionMatch && descriptionMatch[1]) {
              const description = descriptionMatch[1];
              formattedText = `<span style="font-weight:bold; color:red; font-size:31px; text-align:center;">作者信息：${description}</span><br><span style="font-weight:bold; color:red; font-size:31px; text-align:center;">请确认这不是一个真实ID</span>`;
            } else {
              formattedText = `<span style="font-size:31px; text-align:center;">留空</span>`;
            }
            $w("#text14").html = formattedText; // 使用 .html 来设置富文本
          })
          .catch(error => console.log("读取文件内容失败", error));
      }
    })
    .catch(error => console.log("文件上传失败", error));
});

});



//以下是个人战限定函数 现在不需要报名也能提交，但是要用 loadCurrentUserLink获取到链接了才能提交


function checkIfUserRegistered() {  
    wixData.query('jobApplication089')
        .eq("_owner", wixUsers.currentUser.id)
        .find()
        .then(results => {
            if (results.items.length > 0) {
                $w("#button1").enable();
                $w("#button1").label = "提交作品";
            } else {
                $w("#button1").enable();
                $w("#button1").label = "提交作品";
                // $w("#button1").disable();
                // $w("#button1").label = "没报名";
            }
        })
        .catch(err => {
            console.error("检查用户是否报名时出错:", err);
        });
}




// 以下是小队战限定
// async function checkIfUserRegistered() {
//     const userLink = await loadCurrentUserLink();
//     if (!userLink) {
//         console.log("无法获取用户链接，可能用户未注册");
//         $w("#button1").disable();
//         $w("#button1").label = "未找到用户";
//         return;
//     }

//     // 并发执行针对每个成员字段的查询
//     const memberQueries = [
//         wixData.query('TeamMMFC').eq("member1", userLink),
//         wixData.query('TeamMMFC').eq("member2", userLink),
//         wixData.query('TeamMMFC').eq("Member3", userLink)  
//     ];

//     Promise.all(memberQueries.map(query => query.find()))
//         .then(resultsArray => {
//             const found = resultsArray.some(results => results.items.length > 0);
//             if (found) {
//                 $w("#button1").enable();
//                 $w("#button1").label = "提交作品";

//                 // 设置表单中的团队名
//                 for (let results of resultsArray) {
//                     if (results.items.length > 0) {
//                         console.log(results.items[0].teamname);
//                         $w("#team").value = results.items[0].teamname;
//                         break;  // 找到就填写并停止循环
//                     }
//                 }
//             } else {
//                 $w("#button1").disable();
//                 $w("#button1").label = "未查询到队伍";
//             }
//         })
//         .catch(err => {
//             console.error("检查用户是否报名时出错:", err);
//         });
// }





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