// Test settings. The test database is separate from the development one.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://smart:smart@localhost:5432/smart_reply_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret';
process.env.ENCRYPTION_KEY = '1'.repeat(64);
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './storage-test';
process.env.LOG_LEVEL = 'error';
process.env.API_URL = 'http://localhost:4999';
process.env.META_GRAPH_URL = 'http://meta.test';
