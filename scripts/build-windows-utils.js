const fs = require('node:fs');

const PE_SIGNATURE = Buffer.from([0x50, 0x45, 0x00, 0x00]);
const WINDOWS_MACHINE_TYPES = {
  ia32: 0x014c,
  x64: 0x8664,
  arm64: 0xaa64,
};

function parseWindowsTargetArch(args) {
  if (args.includes('--arm64')) {
    return 'arm64';
  }
  if (args.includes('--ia32')) {
    return 'ia32';
  }
  return 'x64';
}

function getWindowsMachineName(machine) {
  for (const [name, code] of Object.entries(WINDOWS_MACHINE_TYPES)) {
    if (code === machine) {
      return name;
    }
  }

  return `unknown(0x${machine.toString(16)})`;
}

function readWindowsPeInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const handle = fs.openSync(filePath, 'r');
  try {
    const dosHeader = Buffer.alloc(64);
    const dosBytesRead = fs.readSync(handle, dosHeader, 0, dosHeader.length, 0);
    if (dosBytesRead < dosHeader.length || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      return null;
    }

    const peOffset = dosHeader.readUInt32LE(0x3c);
    const peHeader = Buffer.alloc(6);
    const peBytesRead = fs.readSync(handle, peHeader, 0, peHeader.length, peOffset);
    if (peBytesRead < peHeader.length || !peHeader.subarray(0, 4).equals(PE_SIGNATURE)) {
      return null;
    }

    return {
      machine: peHeader.readUInt16LE(4),
      peOffset,
    };
  } finally {
    fs.closeSync(handle);
  }
}

function validateWindowsBinaryForArch(filePath, expectedArch) {
  const info = readWindowsPeInfo(filePath);
  if (!info) {
    return {
      ok: false,
      reason: 'not-pe',
    };
  }

  const expectedMachine = WINDOWS_MACHINE_TYPES[expectedArch];
  if (!expectedMachine) {
    return {
      ok: false,
      reason: 'unknown-arch',
      actualArch: getWindowsMachineName(info.machine),
    };
  }

  const actualArch = getWindowsMachineName(info.machine);
  if (info.machine !== expectedMachine) {
    return {
      ok: false,
      reason: 'machine-mismatch',
      actualArch,
      expectedArch,
    };
  }

  return {
    ok: true,
    actualArch,
    expectedArch,
  };
}

module.exports = {
  WINDOWS_MACHINE_TYPES,
  getWindowsMachineName,
  parseWindowsTargetArch,
  readWindowsPeInfo,
  validateWindowsBinaryForArch,
};
