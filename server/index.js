import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import {
  closeDatabase,
  connectDatabase,
  getDatabase,
  migrateDatabase,
} from './database.js';

const app = express();
app.disable('x-powered-by');

const corsConfig = {
  origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

const dbConnection = () => {
  try {
    connectDatabase(config.sqlitePath);
    migrateDatabase();
  } catch (error) {
    console.error('初始化本地SQLite数据库失败:', error);
    process.exit(1);
  }
};

dbConnection();

const serializeJsonColumn = (value, fallback) => {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('序列化JSON字段失败，使用默认值:', error.message);
      return JSON.stringify(fallback);
    }
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return JSON.stringify(fallback);
};

const coerceBooleanFlag = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') {
      return true;
    }
    if (normalized === '0' || normalized === 'false') {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return Boolean(value);
};

app.get('/api/health', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();

    res.json({
      status: 'ok',
      message: 'SQLite数据库连接正常',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('健康检查失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'SQLite数据库连接失败',
      error: error.message,
    });
  }
});

app.get('/api/auth-status', (req, res) => {
  const requiresAuth = !!(config.password && config.password.length > 0);
  res.json({
    requiresAuth,
    message: requiresAuth ? '需要密码认证' : '无需认证',
  });
});

app.post('/api/login', (req, res) => {
  try {
    const { password } = req.body || {};

    if (!config.password || !config.password.trim()) {
      return res.json({
        success: true,
        message: '无需密码认证，直接登录成功',
      });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({
        success: false,
        message: '密码不能为空',
      });
    }

    const isValid = password.trim() === config.password;

    if (isValid) {
      return res.json({ success: true, message: '登录成功' });
    }

    return res.status(401).json({ success: false, message: '密码错误' });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录时发生错误',
    });
  }
});

app.post('/api/verify-password', (req, res) => {
  try {
    const { password } = req.body || {};

    if (!config.password || !config.password.trim()) {
      return res.json({
        valid: true,
        message: '无需密码认证',
      });
    }

    const isValid = password && password.trim() === config.password;
    res.json({
      valid: !!isValid,
      message: isValid ? '密码正确' : '密码错误',
    });
  } catch (error) {
    console.error('验证密码失败:', error);
    res.status(500).json({
      valid: false,
      message: '验证密码时发生错误',
    });
  }
});

app.post('/api/init', (req, res) => {
  try {
    if (config.initToken) {
      const authHeader = req.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${config.initToken}`) {
        return res.status(401).json({
          success: false,
          message: '未授权访问',
        });
      }
    }

    migrateDatabase();
    res.json({ success: true, message: '数据库初始化成功' });
  } catch (error) {
    console.error('数据库初始化失败:', error);
    res.status(500).json({
      success: false,
      message: '数据库初始化失败',
      error: error.message,
    });
  }
});

app.get('/api/memos', (req, res) => {
  try {
    const publicOnly = req.query.public_only === 'true';
    const db = getDatabase();
    const sql = publicOnly
      ? 'SELECT * FROM memos WHERE is_public = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM memos ORDER BY created_at DESC';

    const results = db.prepare(sql).all();
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('查询memos失败:', error);
    res.status(500).json({
      success: false,
      message: '处理memos请求失败',
      error: error.message,
    });
  }
});

app.post('/api/memos', (req, res) => {
  try {
    const {
      memo_id,
      content,
      tags,
      backlinks,
      audio_clips,
      is_public,
      created_at,
      updated_at,
    } = req.body || {};

    if (!memo_id || !content) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    const now = new Date().toISOString();
    const db = getDatabase();

    const payload = {
      memo_id,
      content,
      tags: serializeJsonColumn(tags, []),
      backlinks: serializeJsonColumn(backlinks, []),
      audio_clips: serializeJsonColumn(audio_clips, []),
  is_public: coerceBooleanFlag(is_public) ? 1 : 0,
      created_at: created_at || now,
      updated_at: updated_at || now,
    };

    const existing = db
      .prepare('SELECT id FROM memos WHERE memo_id = ?')
      .get(memo_id);

    if (existing) {
      db.prepare(
        `UPDATE memos
         SET content = @content,
             tags = @tags,
             backlinks = @backlinks,
             audio_clips = @audio_clips,
             is_public = @is_public,
             updated_at = @updated_at
         WHERE memo_id = @memo_id`
      ).run(payload);
    } else {
      db.prepare(
        `INSERT INTO memos (memo_id, content, tags, backlinks, audio_clips, is_public, created_at, updated_at)
         VALUES (@memo_id, @content, @tags, @backlinks, @audio_clips, @is_public, @created_at, @updated_at)`
      ).run(payload);
    }

    res.json({ success: true, message: 'Memo保存成功' });
  } catch (error) {
    console.error('保存memo失败:', error);
    res.status(500).json({
      success: false,
      message: '处理memos请求失败',
      error: error.message,
    });
  }
});

app.delete('/api/memos', (req, res) => {
  try {
    const memoId = req.query.memoId;

    if (!memoId) {
      return res.status(400).json({ success: false, message: '缺少memoId参数' });
    }

    const db = getDatabase();
    db.prepare('DELETE FROM memos WHERE memo_id = ?').run(memoId);

    res.json({ success: true, message: 'Memo删除成功' });
  } catch (error) {
    console.error('删除memo失败:', error);
    res.status(500).json({
      success: false,
      message: '处理memos请求失败',
      error: error.message,
    });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM user_settings ORDER BY id LIMIT 1').get();

    res.json({ success: true, data: settings || null });
  } catch (error) {
    console.error('获取用户设置失败:', error);
    res.status(500).json({
      success: false,
      message: '处理用户设置请求失败',
      error: error.message,
    });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const {
      pinned_memos,
      theme_color,
      dark_mode,
      hitokoto_config,
      font_config,
      background_config,
      avatar_config,
      canvas_config,
      music_config,
      s3_config,
    } = req.body || {};

    const db = getDatabase();
    const existing = db
      .prepare('SELECT id FROM user_settings ORDER BY id LIMIT 1')
      .get();

    const now = new Date().toISOString();
    const payload = {
      pinned_memos: serializeJsonColumn(pinned_memos, []),
      theme_color: theme_color || '#818CF8',
  dark_mode: coerceBooleanFlag(dark_mode) ? 1 : 0,
      hitokoto_config: serializeJsonColumn(hitokoto_config, {
        enabled: true,
        types: ['a', 'b', 'c', 'd', 'i', 'j', 'k'],
      }),
      font_config: serializeJsonColumn(font_config, { selectedFont: 'default' }),
      background_config: serializeJsonColumn(background_config, {
        imageUrl: '',
        brightness: 50,
        blur: 10,
        useRandom: false,
      }),
      avatar_config: serializeJsonColumn(avatar_config, { imageUrl: '' }),
      canvas_config:
        canvas_config !== undefined && canvas_config !== null
          ? serializeJsonColumn(canvas_config, null)
          : null,
      music_config: serializeJsonColumn(music_config, {
        enabled: true,
        customSongs: [],
      }),
      s3_config: serializeJsonColumn(s3_config, {
        enabled: false,
        endpoint: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucket: '',
        region: 'auto',
        publicUrl: '',
        provider: 'r2',
      }),
      updated_at: now,
    };

    if (existing) {
      db.prepare(
        `UPDATE user_settings
         SET pinned_memos = @pinned_memos,
             theme_color = @theme_color,
             dark_mode = @dark_mode,
             hitokoto_config = @hitokoto_config,
             font_config = @font_config,
             background_config = @background_config,
             avatar_config = @avatar_config,
             canvas_config = @canvas_config,
             music_config = @music_config,
             s3_config = @s3_config,
             updated_at = @updated_at
         WHERE id = @id`
      ).run({ ...payload, id: existing.id });
    } else {
      db.prepare(
        `INSERT INTO user_settings (
            pinned_memos,
            theme_color,
            dark_mode,
            hitokoto_config,
            font_config,
            background_config,
            avatar_config,
            canvas_config,
            music_config,
            s3_config,
            created_at,
            updated_at
         ) VALUES (
            @pinned_memos,
            @theme_color,
            @dark_mode,
            @hitokoto_config,
            @font_config,
            @background_config,
            @avatar_config,
            @canvas_config,
            @music_config,
            @s3_config,
            @created_at,
            @updated_at
         )`
      ).run({ ...payload, created_at: now });
    }

    res.json({ success: true, message: '用户设置保存成功' });
  } catch (error) {
    console.error('保存用户设置失败:', error);
    res.status(500).json({
      success: false,
      message: '处理用户设置请求失败',
      error: error.message,
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: '未找到请求的API端点' });
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(currentDir, '..', 'dist');
const buildDirectory = path.resolve(currentDir, '..', 'build');
const distPath = fs.existsSync(distDirectory) ? distDirectory : buildDirectory;

if (config.serveStatic && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(200).json({
      success: true,
      message: '前端资源未构建，当前仅提供API服务',
    });
  });
}

app.use((error, req, res, next) => {
  console.error('未处理的服务器错误:', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: error.message,
  });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`MeowNocode server is running on port ${config.port}`);
  console.log(`SQLite database located at ${config.sqlitePath}`);
});

const shutdown = (signal) => {
  console.log(`收到${signal}信号，准备关闭服务器...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
