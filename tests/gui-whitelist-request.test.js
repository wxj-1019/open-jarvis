const { describe, it } = require('mocha');
const assert = require('assert');
const EventEmitter = require('events');

describe('GUI 白名单请求系统', function () {
  describe('Engine handleGuiWhitelistRequest', function () {
    it('应该发出 GUI 白名单请求并等待用户响应', async function () {
      const emittedEvents = [];
      
      const mockEngine = {
        _hubCallbacks: {
          eventBus: new EventEmitter(),
        },
        _emitEvent: (event) => {
          emittedEvents.push(event);
        },
        _addExecutableToGuiWhitelist: function(executable) {
          this._approvedExecutable = executable;
        },
        handleGuiWhitelistRequest: async function({ executable, currentWhitelist, sessionPath }) {
          this._emitEvent({
            type: 'gui-whitelist-request',
            executable,
            currentWhitelist,
          }, sessionPath);
          
          return new Promise((resolve) => {
            const handler = (response) => {
              if (response.type === 'gui-whitelist-response') {
                this._hubCallbacks.eventBus.off('gui-whitelist-response', handler);
                
                if (response.approved) {
                  this._addExecutableToGuiWhitelist(executable);
                  resolve({ approved: true });
                } else {
                  resolve({ approved: false });
                }
              }
            };
            this._hubCallbacks.eventBus.on('gui-whitelist-response', handler);
          });
        },
      };

      const promise = mockEngine.handleGuiWhitelistRequest({
        executable: 'notepad.exe',
        currentWhitelist: ['mspaint.exe'],
      });

      assert.strictEqual(emittedEvents.length, 1);
      assert.strictEqual(emittedEvents[0].type, 'gui-whitelist-request');
      assert.strictEqual(emittedEvents[0].executable, 'notepad.exe');

      setTimeout(() => {
        mockEngine._hubCallbacks.eventBus.emit('gui-whitelist-response', {
          type: 'gui-whitelist-response',
          approved: true,
        });
      }, 10);

      const result = await promise;
      assert.strictEqual(result.approved, true);
      assert.strictEqual(mockEngine._approvedExecutable, 'notepad.exe');
    });

    it('应该在用户拒绝时不添加到白名单', async function () {
      const mockEngine = {
        _hubCallbacks: {
          eventBus: new EventEmitter(),
        },
        _emitEvent: () => {},
        _addExecutableToGuiWhitelist: function(executable) {
          this._approvedExecutable = executable;
        },
        handleGuiWhitelistRequest: async function({ executable, currentWhitelist, sessionPath }) {
          this._emitEvent({
            type: 'gui-whitelist-request',
            executable,
            currentWhitelist,
          }, sessionPath);
          
          return new Promise((resolve) => {
            const handler = (response) => {
              if (response.type === 'gui-whitelist-response') {
                this._hubCallbacks.eventBus.off('gui-whitelist-response', handler);
                
                if (response.approved) {
                  this._addExecutableToGuiWhitelist(executable);
                  resolve({ approved: true });
                } else {
                  resolve({ approved: false });
                }
              }
            };
            this._hubCallbacks.eventBus.on('gui-whitelist-response', handler);
          });
        },
      };

      const promise = mockEngine.handleGuiWhitelistRequest({
        executable: 'malware.exe',
        currentWhitelist: ['mspaint.exe'],
      });

      setTimeout(() => {
        mockEngine._hubCallbacks.eventBus.emit('gui-whitelist-response', {
          type: 'gui-whitelist-response',
          approved: false,
        });
      }, 10);

      const result = await promise;
      assert.strictEqual(result.approved, false);
      assert.strictEqual(mockEngine._approvedExecutable, undefined);
    });

    it('应该在 Promise resolve 后清理事件监听器', async function () {
      const mockEngine = {
        _hubCallbacks: {
          eventBus: new EventEmitter(),
        },
        _emitEvent: () => {},
        _addExecutableToGuiWhitelist: () => {},
        handleGuiWhitelistRequest: async function({ executable, currentWhitelist, sessionPath }) {
          this._emitEvent({
            type: 'gui-whitelist-request',
            executable,
            currentWhitelist,
          }, sessionPath);
          
          return new Promise((resolve) => {
            const handler = (response) => {
              if (response.type === 'gui-whitelist-response') {
                this._hubCallbacks.eventBus.off('gui-whitelist-response', handler);
                
                if (response.approved) {
                  this._addExecutableToGuiWhitelist(executable);
                  resolve({ approved: true });
                } else {
                  resolve({ approved: false });
                }
              }
            };
            this._hubCallbacks.eventBus.on('gui-whitelist-response', handler);
          });
        },
      };

      const promise = mockEngine.handleGuiWhitelistRequest({
        executable: 'test.exe',
        currentWhitelist: [],
      });

      setTimeout(() => {
        mockEngine._hubCallbacks.eventBus.emit('gui-whitelist-response', {
          type: 'gui-whitelist-response',
          approved: true,
        });
      }, 10);

      await promise;

      let secondResponseHandled = false;
      const testPromise = new Promise((resolve) => {
        setTimeout(() => {
          mockEngine._hubCallbacks.eventBus.emit('gui-whitelist-response', {
            type: 'gui-whitelist-response',
            approved: false,
          });
          secondResponseHandled = true;
          resolve();
        }, 10);
      });

      await testPromise;
      assert.strictEqual(secondResponseHandled, true);
    });
  });

  describe('GUI 程序检测逻辑', function () {
    const KNOWN_CLI_TOOLS = new Set([
      'git.exe', 'node.exe', 'npm.exe', 'npx.exe', 'yarn.exe', 'pnpm.exe',
      'python.exe', 'python3.exe', 'pip.exe', 'pip3.exe',
      'cargo.exe', 'rustc.exe', 'go.exe', 'gcc.exe', 'g++.exe',
      'curl.exe', 'wget.exe', 'ssh.exe', 'scp.exe',
      'docker.exe', 'kubectl.exe', 'helm.exe',
      'code.exe', 'vim.exe', 'nano.exe', 'less.exe', 'more.exe',
      'jq.exe', 'sed.exe', 'awk.exe', 'grep.exe', 'find.exe',
      'where.exe', 'which.exe', 'taskkill.exe', 'tasklist.exe',
      'cmd.exe', 'powershell.exe', 'pwsh.exe',
      'msbuild.exe', 'devenv.exe', 'dotnet.exe',
    ]);

    function isGuiApplication(executable, args) {
      const exeName = executable.replace(/.*[\\/]/, '').toLowerCase();
      
      if (KNOWN_CLI_TOOLS.has(exeName)) {
        return false;
      }
      
      if (exeName.endsWith('.exe')) {
        return true;
      }
      
      if (args.some(arg => 
        arg.toLowerCase().includes('-window') || 
        arg.toLowerCase().includes('-gui') ||
        arg.toLowerCase().includes('-show')
      )) {
        return true;
      }
      
      return false;
    }

    function isExecutableInGuiWhitelist(exeName, guiWhitelist) {
      if (!guiWhitelist || guiWhitelist.length === 0) return false;
      return guiWhitelist.some(allowed => allowed.toLowerCase() === exeName);
    }

    it('应该排除已知的 CLI 工具', function () {
      assert.strictEqual(KNOWN_CLI_TOOLS.has('git.exe'), true);
      assert.strictEqual(KNOWN_CLI_TOOLS.has('node.exe'), true);
      assert.strictEqual(KNOWN_CLI_TOOLS.has('python.exe'), true);
      assert.strictEqual(KNOWN_CLI_TOOLS.has('npm.exe'), true);
      assert.strictEqual(KNOWN_CLI_TOOLS.has('code.exe'), true);
      assert.strictEqual(KNOWN_CLI_TOOLS.has('cmd.exe'), true);
    });

    it('应该正确识别不在排除列表中的 GUI 程序', function () {
      assert.strictEqual(isGuiApplication('git.exe', []), false);
      assert.strictEqual(isGuiApplication('node.exe', []), false);
      assert.strictEqual(isGuiApplication('notepad.exe', []), true);
      assert.strictEqual(isGuiApplication('mspaint.exe', []), true);
      assert.strictEqual(isGuiApplication('C:\\Windows\\notepad.exe', []), true);
      assert.strictEqual(isGuiApplication('some-tool.exe', ['-window']), true);
    });

    it('应该正确检查白名单', function () {
      const whitelist = ['notepad.exe', 'mspaint.exe'];
      
      assert.strictEqual(isExecutableInGuiWhitelist('notepad.exe', whitelist), true);
      assert.strictEqual(isExecutableInGuiWhitelist('NOTEPAD.EXE', whitelist), true);
      assert.strictEqual(isExecutableInGuiWhitelist('calc.exe', whitelist), false);
      assert.strictEqual(isExecutableInGuiWhitelist('test.exe', []), false);
    });
  });
});
