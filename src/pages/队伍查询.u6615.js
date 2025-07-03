import wixData from "wix-data";
import { extractSlugFromURL, getUserInfoBySlug } from 'backend/getUserPublicInfo.jsw';

$w.onReady(function () {
    // 查询 TeamMMFC 数据集
    wixData.query("TeamMMFC").limit(500)
        .find()
        .then((results) => {
            // 检查是否有数据返回
            if (results.items.length > 0) {
                // 处理每一条 TeamMMFC 数据
                const repeaterData = results.items.map((item) => {
                    // 对每个条目，获取三组数据：MEMBER1, MEMBER2, MEMBER3
                    const memberDataPromises = [1, 2, 3].map((memberIndex) => {
                        let memberUrl;
                        if (memberIndex !== 3) {
                            memberUrl = item[`member${memberIndex}`]; // 获取 Member1, Member2, Member3 的 URL
                        } else {
                            memberUrl = item[`Member${memberIndex}`]; // 获取 Member1, Member2, Member3 的 URL
                        }

                        // 返回每个成员的详细信息（通过slug获取）
                        return extractSlugFromURL(memberUrl)
                            .then((slug) => {
                                if (slug) {
                                    return getUserInfoBySlug(slug); // 根据 slug 获取用户信息
                                }
                                return null; // 如果没有slug，返回null
                            })
                            .catch((error) => {
                                console.log(`获取 Member${memberIndex} 的信息时出错:`, error);
                                return null; // 发生错误时返回 null
                            });
                    });

                    // 等待三个成员的数据获取完成，并将数据存储
                    return Promise.all(memberDataPromises)
                        .then(([member1Info, member2Info, member3Info]) => {
                           

                            // 确保每个成员的数据都存在
                            return {
                                member1Info: member1Info || { nickname: "", profilePhoto: { url: "" } },
                                member2Info: member2Info || { nickname: "", profilePhoto: { url: "" } },
                                member3Info: member3Info || { nickname: "", profilePhoto: { url: "" } }
                            };
                        })
                        .catch((error) => {
                            console.log("处理成员数据时出错:", error);
                            return {
                                member1Info: null,
                                member2Info: null,
                                member3Info: null
                            }; // 返回一个空对象，避免未定义的情况
                        });
                });

                // 一旦所有条目数据加载完，填充repeater
                Promise.all(repeaterData)
                    .then((data) => {
                        // 填充 Repeater 的数据
                        $w("#repeater1").data = data;

                        // 当 Repeater 数据加载完成后，设置每一项的内容
                        $w("#repeater1").onItemReady(($item, itemData, index) => {
                            const memberData = data[index];

                            // 设置成员1的信息，检查是否为 null 或 undefined
                            if (memberData.member1Info) {
                                // 检查头像是否存在，如果存在则赋值头像
                                if (memberData.member1Info.profilePhoto) {
                                    $item("#ava1").src = memberData.member1Info.profilePhoto.url || "";
                                }
                                // 姓名必填，赋值名字
                                $item("#member1").text = memberData.member1Info.nickname || "";
                                
                            }

                            // 设置成员2的信息，检查是否为 null 或 undefined
                            if (memberData.member2Info) {
                                // 检查头像是否存在，如果存在则赋值头像
                                if (memberData.member2Info.profilePhoto) {
                                    $item("#ava2").src = memberData.member2Info.profilePhoto.url || "";
                                }
                                // 姓名必填，赋值名字
                                $item("#member2").text = memberData.member2Info.nickname || "";
                            }

                            // 设置成员3的信息，检查是否为 null 或 undefined
                            if (memberData.member3Info) {
                                // 检查头像是否存在，如果存在则赋值头像
                                if (memberData.member3Info.profilePhoto) {
                                    $item("#ava3").src = memberData.member3Info.profilePhoto.url || "";
                                }
                                // 姓名必填，赋值名字
                                $item("#member3").text = memberData.member3Info.nickname || "";
                            }
                        });
                    })
                    .catch((error) => {
                        console.log("填充 Repeater 数据失败:", error);
                    });

            }
        })
        .catch((error) => {
            console.log("查询 TeamMMFC 数据失败", error);
        });




        // 从 enterContest034 数据集中读取所有记录
    wixData.query("enterContest034")
        .find()
        .then(results => {
            let filteredItems = results.items.filter(item => {
                // 检查 disByString 字段内容的长度
                if (item.disByString && Array.isArray(item.disByString)) {
                    return item.disByString.length >= 3;
                }
                return false;
            });

            // 处理筛选后的数据
            let tableData = filteredItems.map(item => {
                return {
                    title: item.firstName,          // 使用 firstName 作为表格标题
                    sequenceId: item.sequenceId,    // 使用 sequenceId 作为序号
                    disByStringLength: item.disByString.length  // 可以根据需要添加其他字段，例如 disByString 的长度
                };
            });

            // 在这里将 tableData 赋值给你的表格组件
            // 假设你有一个表格组件叫做 `#myTable`
            $w('#table1').rows = tableData;
        })
        .catch(error => {
            console.log("Error retrieving data: ", error);
        });









});


