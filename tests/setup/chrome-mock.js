// Shared Chrome extension API mocks for unit tests
global.chrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn()
    },
    getManifest: jest.fn().mockReturnValue({ permissions: [] })
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue([])
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: jest.fn().mockResolvedValue({})
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1)
  },
  storage: {
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: { addListener: jest.fn() }
  }
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
