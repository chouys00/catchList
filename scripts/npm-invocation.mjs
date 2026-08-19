export function npmInvocation(platform, npmExecPath, nodePath) {
  if (platform === "win32") {
    if (!npmExecPath) {
      throw new Error("找不到 npm CLI 路徑");
    }

    return {
      command: nodePath,
      args: [npmExecPath, "run", "update"],
    };
  }

  return {
    command: "npm",
    args: ["run", "update"],
  };
}
