import { ok, badRequest, notFound, serverError } from 'wix-http-functions';
import { fetch } from 'wix-fetch';
import { getEnterContest034Data } from 'backend/enterContest034Api.jsw';
import wixData from 'wix-data';
import { getFileDownloadUrlAndContent } from 'backend/getMediaDownloadUrls.jsw';
import { mediaManager } from 'wix-media-backend';
import { response } from 'wix-http-functions';
import CryptoJS from 'crypto-js';

export function options_contestList(request) {
    let headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Max-Age": "86400"
    }
    return response({ "status": 204, "headers": headers });
}

export function options_contestEntry(request) {
    let headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Max-Age": "86400"
    }
    return response({ "status": 204, "headers": headers });
}

export async function getEnterContest034DataBySequenceId(sequenceId) {
    const results = await wixData.query('enterContest034')
        .eq('sequenceId', sequenceId)
        .find();

    if (results.items.length > 0) {
        const item = results.items[0];
        const files = {
            txtFileUrl: item.inVideo的複本,
            mp3FileUrl: item.maidata的複本,
            bgFileUrl: item.track的複本,
            bgVideoUrl: item.上傳檔案欄,
            approvedBy: item.approvedByString ? JSON.parse(item.approvedByString).length : 0,
            viewedBy: item.viewedBy ? JSON.parse(item.viewedBy).length : 0, // 获取查看过该项目的用户ID列表的长度

        };
        return { ...item, ...files };
    }

    return null;
}

export async function get_contestList(request) {
    try {
        const data = await getEnterContest034Data();

        console.log("Request headers: ", request.headers);

        if (data) {
            const filteredData = data.map(item => {
                // 解析 JSON 数据
                const approvedCount = item.approvedByString ? JSON.parse(item.approvedByString).length : 0;
                const viewedCount = item.viewedBy ? JSON.parse(item.viewedBy).length : 0;

                // 计算 viewBy 的票数
                let viewedVotes = 0;
                if (viewedCount >= 10) viewedVotes = 1;
                if (viewedCount >= 20) viewedVotes = 2;

                // 计算总票数
                const totalVotes = approvedCount + viewedVotes;

                // 判断是否过审
                const isApproved = totalVotes >= 5;

                return {
                    Title: item.firstName, // 假设这是作品的标题
                    sequenceId: item.sequenceId, // 作品的序列ID
                    Description: item.較長答案欄, // 追加描述字段
                    AllowDownload: item.核取方塊欄, // 是否允许下载
                    approvedBy: approvedCount,
                    viewedBy: viewedCount,
                    IsApproved: isApproved // 新添加的是否过审字段
                };
            });
            return ok({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify(filteredData)
            });
        } else {
            console.log("Data not found");
            return notFound({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify({ "message": "Data not found" })
            });
        }

    } catch (error) {
        console.error('Error fetching data:', error);
        return serverError({
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": JSON.stringify({ "message": "An error occurred while fetching data" })
        });
    }
}

export async function get_contestEntry(request) {
    try {
        const sequenceId = parseInt(request.path[0], 10);
        const fileType = parseInt(request.path[1], 10);
        const data = await getEnterContest034DataBySequenceId(sequenceId);
        const secretKey = '1f2bb3f9735fc8c4b08b186f91f8f08b';

        if (data) {
            //console.log("Data fetched successfully:", data);

            let responseContentType;
            let responseBody;

            switch (fileType) {
                // case 1: { // txt 文件
                //     const { fileContent: txtFile } = await getFileDownloadUrlAndContent(data.txtFileUrl);
                //     responseContentType = 'text/plain';
                //     responseBody = txtFile;
                //     break;
                // }

            case 1: { // txt 文件
                const { fileContent: txtFile } = await getFileDownloadUrlAndContent(data.txtFileUrl);
                responseContentType = 'text/plain';

                // 加密
                //const encryptedTxtFile = CryptoJS.AES.encrypt(txtFile, secretKey).toString();
                //responseBody = encryptedTxtFile;
                responseBody = txtFile;

                break;
            }

            case 2: { // mp3 文件
                responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.mp3FileUrl) };
                responseContentType = 'application/json';
                break;
            }
            case 3: { // bg 文件
                responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.bgFileUrl) };
                responseContentType = 'application/json';
                break;
            }

            case 4: { // bg 文件
                responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.bgVideoUrl) };
                responseContentType = 'application/json';
                break;
            }

            default:
                return badRequest({
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    },
                    "body": JSON.stringify({ "message": "Invalid file type parameter: " + fileType })
                });
            }

            // 返回指定类型的文件
            return ok({
                "headers": {
                    "Content-Type": responseContentType,
                    "Access-Control-Allow-Origin": "*"
                },
                "body": responseBody
            });
        } else {
            return notFound({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify({ "message": "Data not found for sequenceId: " + sequenceId })
            });
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        return serverError({
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": JSON.stringify({ "message": "Error fetching data: " + error.message })
        });
    }
}

// 处理 HTTP GET 请求，获取按 workNumber 分组的评论
export async function get_comments(request) {
    try {
        // 创建查询对象
        const query = wixData.query('BOFcomment').ascending('workNumber');
        // 加载所有数据
        const allItems = await loadAllData(query);

        if (allItems.length > 0) {
            // 使用 reduce 方法按 workNumber 进行分组
            const groupedByWorkNumber = allItems.reduce((acc, item) => {
                // 如果还没有为当前 workNumber 创建数组，则初始化一个空数组
                if (!acc[item.workNumber]) {
                    acc[item.workNumber] = [];
                }
                // 将评论添加到对应的 workNumber 组
                acc[item.workNumber].push(item.comment);
                return acc;
            }, {});

            // 返回成功的响应，包括设置跨域访问的响应头
            return ok({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify(groupedByWorkNumber)
            });
        } else {
            // 如果没有找到数据，返回未找到的响应
            return notFound({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify({ "message": "No data found" })
            });
        }
    } catch (error) {
        // 如果在查询过程中发生错误，返回服务器错误的响应
        console.error('Error fetching data:', error);
        return serverError({
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": JSON.stringify({ "message": "An error occurred while fetching data" })
        });
    }
}






// 处理 HTTP GET 请求，获取按 postId 分组的 PostLogs 数据
export async function get_postLogs(request) {
    try {
        // 创建查询对象，按时间戳升序排序
        const query = wixData.query('PostLogs').ascending('timestamp');
        // 加载所有数据
        const allItems = await loadAllData(query);

        if (allItems.length > 0) {
            // 使用 reduce 方法按 postId 进行分组
            const groupedByPostId = allItems.reduce((acc, item) => {
                // 如果还没有为当前 postId 创建数组，则初始化一个空数组
                if (!acc[item.postId]) {
                    acc[item.postId] = [];
                }
                // 将日志项添加到对应的 postId 组
                acc[item.postId].push(item);
                return acc;
            }, {});

            // 返回成功的响应，包括设置跨域访问的响应头
            return ok({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*" // 支持跨域访问
                },
                "body": JSON.stringify(groupedByPostId) // 返回按 postId 分组的日志数据
            });
        } else {
            // 如果没有找到数据，返回未找到的响应
            return notFound({
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": JSON.stringify({ "message": "No data found" })
            });
        }
    } catch (error) {
        // 如果在查询过程中发生错误，返回服务器错误的响应
        console.error('Error fetching PostLogs:', error);
        return serverError({
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": JSON.stringify({ "message": "An error occurred while fetching PostLogs" })
        });
    }
}
















// 递归函数，用于分页加载所有数据
async function loadAllData(query, accumulatedData = []) {
    const pageSize = 1000; // 你可以根据需要设置一个较大的值，最大为1000
    const results = await query.limit(pageSize).skip(accumulatedData.length).find();

    if (results.items.length > 0) {
        // 如果查询到数据，将数据追加到累积数组
        accumulatedData = accumulatedData.concat(results.items);
        // 如果查询到的数据达到页面大小，可能还有更多数据，继续查询
        if (results.items.length === pageSize) {
            return loadAllData(query, accumulatedData);
        }
    }
    return accumulatedData;
}