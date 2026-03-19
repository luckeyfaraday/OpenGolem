function targetsWindows(args) {
  return args.some((arg) => arg === '--win' || arg === '--windows' || arg === '-w');
}

module.exports = {
  targetsWindows,
};
