// Without a Developer ID, ad-hoc sign the mac app so it launches on Apple Silicon
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
	if (context.electronPlatformName !== "darwin") return;
	if (process.env.CSC_LINK || process.env.CSC_NAME) return;
	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);
	execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
		stdio: "inherit",
	});
};
