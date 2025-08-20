import dayjs from "dayjs";
import CryptoJS from "crypto-js";
import {
	Base64
} from "js-base64";

import apiUser from '@/utils/api/user.js'

const date = new Date();
date.setHours(date.getHours() + 1);
const policyText = {
	expiration: date.toISOString(), // 设置policy过期时间。
	conditions: [
		// 限制上传大小。
		["content-length-range", 0, 1024 * 1024 * 1024],
	],
};

// 计算签名。
function computeSignature(accessKeySecret, canonicalString) {
	return CryptoJS.enc.Base64.stringify(
		CryptoJS.HmacSHA1(canonicalString, accessKeySecret)
	);
}

/**
 * 获取上传 token
 * @returns
 */
export function getToken() {
	return new Promise((resolve, reject) => {
		apiUser.ossToken().then(res => {
			resolve(res.data);
		})
	});
}
/**
 * 生成简单的字符串hash
 * @param str 输入字符串
 * @returns hash值（16位长度）
 */
function simpleHash(str) {
	let hash1 = 0;
	let hash2 = 0;
	if (str.length === 0) {
		return "0000000000000000";
	}

	// 使用两个不同的hash算法增加复杂度
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		// 第一个hash算法
		hash1 = (hash1 << 5) - hash1 + char;
		hash1 = hash1 & hash1; // 转换为32位整数

		// 第二个hash算法
		hash2 = (hash2 << 3) + hash2 + char;
		hash2 = hash2 & hash2; // 转换为32位整数
	}

	// 组合两个hash值并转换为36进制，确保16位长度
	const combined = Math.abs(hash1).toString(36) + Math.abs(hash2).toString(36);
	const result = combined.substring(0, 16).padEnd(16, "0");

	return result;
}

/**
 * 生成文件名hash
 * @param file 文件对象
 * @param prefix 文件名前缀，默认为当前日期
 * @returns 生成的hash文件名
 */
function generateFileNameHash(file, prefix) {
	// 获取文件基本信息
	const fileName = file.name || file.path || file;
	const fileSize = file.size;
	const fileType = file.type;
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);

	// 使用文件信息和时间戳生成hash
	const hashInput = `${fileName}-${fileSize}-${fileType}-${timestamp}-${random}`;
	const hash = simpleHash(hashInput);

	// 获取文件扩展名
	const fileExtension = fileName.split(".").pop() || "";

	// 生成最终的文件名
	const datePrefix = prefix || dayjs().format("YYYY-MM-DD");
	const finalFileName = `${datePrefix}/${hash}.${fileExtension}`;

	return finalFileName;
}

export async function upload(file) {
	// TEST:
	// return new Promise((resolve, reject) => {
	//   setTimeout(() => {
	//     resolve({ file: "https://picsum.photos/800/600", error: null });
	//   }, 1000);
	// });
	let path = "";
	if (typeof file === "string") {
		path = file;
	} else {
		path = file.path;
	}

	if (path === "") {
		return;
	}

	const token = await getToken();
	let key = generateFileNameHash(file);
	// TODO: 测试环境
	const prefix = "test/";
	key = prefix + key;
	return new Promise(async (resolve, reject) => {
		try {
			const policy = Base64.encode(JSON.stringify(policyText));
			const signature = computeSignature(token.accessKeySecret, policy);
			const data = {
				url: token.endpoint,
				method: "POST",
				filePath: path,
				name: "file",
				formData: {
					key: key,
					OSSAccessKeyId: token.accessKeyId,
					"x-oss-security-token": token.securityToken,
					policy,
					signature,
					success_action_status: "200",
				},
				success: (res) => {
					console.log("上传完成", res);
					// 构建文件访问URL
					// 如果token中有host字段，使用host；否则使用endpoint
					const baseUrl = token.host || token.endpoint;
					const fileUrl = `${baseUrl}/${key}`;
					resolve({
						file: fileUrl,
						error: null
					});
				},
				fail: (err) => {
					console.error("上传失败", err);
					reject({
						file: null,
						error: err
					});
				},
			}
			await uni.uploadFile(data);
			// 移除这里的resolve()，因为已经在success回调中处理了
		} catch (error) {
			reject(error);
		}
	});
}

export function chooseAndUploadFile() {
	return new Promise((resolve, reject) => {
		uni.chooseImage({
			count: 1,
			sizeType: ["compressed"],
			sourceType: ["album"],
			success: async (res) => {
				try {
					uni.showLoading({
						title: "上传中...",
					});
					const response = await upload(res.tempFiles[0]);
					uni.hideLoading();
					if (response && response.file) {
						uni.showToast({
							title: "上传成功",
							icon: "success",
						});
						resolve(response.file);
					} else {
						uni.showToast({
							title: "上传图片失败",
							icon: "none",
						});
						reject(new Error("上传图片失败"));
					}
				} catch (error) {
					uni.hideLoading();
					uni.showToast({
						title: error?.error?.errMsg || '上传失败',
						icon: "error",
					});
					reject(error);
				}
			},
		});
	});
}