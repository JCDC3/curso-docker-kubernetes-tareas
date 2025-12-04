// Importaciones de módulos necesarios
const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');

// Configuración de la aplicación y puertos
const app = express();
const PORT = 5000;
const CACHE_KEY = 'popular_posts';
const CACHE_EXPIRATION_SECONDS = 60; // 1 minuto

app.use(express.json());

// --- Configuración de la Base de Datos PostgreSQL (DB) ---
const dbPool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'db', // Nombre del servicio en docker-compose
    database: process.env.POSTGRES_DB || 'blogdb',
    password: process.env.POSTGRES_PASSWORD || 'secret',
    port: 5432,
});

// --- Configuración de Redis (CACHE) ---
const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || 'redis'}:6379`, // Nombre del servicio en docker-compose
});

redisClient.on('error', err => console.error('Redis Client Error', err));

// --- Función de inicialización con lógica de reintentos (retry logic) ---
// Es crucial para que el backend espere a que la DB y Redis estén realmente listos.
async function initWithRetries(maxRetries = 15, delay = 3000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Intento ${attempt}/${maxRetries}] Conectando a Redis y PostgreSQL...`);

            // 1. Conexión a Redis
            if (!redisClient.isOpen) {
                await redisClient.connect();
            }
            console.log('✅ Redis conectado y listo.');

            // 2. Conexión y setup de PostgreSQL
            const client = await dbPool.connect();
            await client.query(`
                CREATE TABLE IF NOT EXISTS posts (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    content TEXT,
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
                );
            `);
            client.release();
            console.log('✅ PostgreSQL inicializado y tabla posts creada.');
            
            // Si todo tiene éxito, salimos de la función
            return; 

        } catch (error) {
            console.error(`❌ Falló la conexión/inicialización (Intento ${attempt}):`, error.message);
            
            if (attempt === maxRetries) {
                console.error('🚫 Se agotó el número máximo de reintentos. Saliendo de la aplicación.');
                // Salir si falla el último intento
                process.exit(1); 
            }
            
            // Esperamos antes de reintentar
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Middleware de Cache: verifica si la data está en Redis
const cacheMiddleware = async (req, res, next) => {
    try {
        const cachedData = await redisClient.get(CACHE_KEY);
        if (cachedData) {
            console.log('⚡️ Cache HIT para /posts');
            return res.json({ 
                source: 'cache', 
                data: JSON.parse(cachedData) 
            });
        }
        console.log('🐌 Cache MISS para /posts. Consultando DB.');
        next();
    } catch (err) {
        console.error('Error en cache middleware:', err);
        next(); // Continúa a la DB si hay error de Redis
    }
};

// --- Endpoints ---

// 1. GET /posts (Listar posts con cache) - ANTES /api/posts
app.get('/posts', cacheMiddleware, async (req, res) => {
    try {
        const result = await dbPool.query('SELECT id, title, content FROM posts ORDER BY created_at DESC');
        const posts = result.rows;

        // Almacenar en Redis después de obtener de la DB
        await redisClient.setEx(CACHE_KEY, CACHE_EXPIRATION_SECONDS, JSON.stringify(posts));

        res.json({ 
            source: 'database', 
            data: posts 
        });
    } catch (error) {
        console.error('Error al obtener posts:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// 2. GET /posts/:id (Ver post - sin cache) - ANTES /api/posts/:id
app.get('/posts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await dbPool.query('SELECT id, title, content FROM posts WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Post no encontrado.' });
        }
        res.json({ source: 'database', data: result.rows[0] });
    } catch (error) {
        console.error('Error al obtener post:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// 3. POST /posts (Crear post e invalidar cache) - ANTES /api/posts
app.post('/posts', async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Título y contenido son requeridos.' });
    }
    try {
        const result = await dbPool.query(
            'INSERT INTO posts (title, content) VALUES ($1, $2) RETURNING *',
            [title, content]
        );
        
        // Invalida la cache de la lista de posts (Cache Invalidation)
        await redisClient.del(CACHE_KEY);
        console.log('🔥 Cache invalidada tras la creación del post.');

        res.status(201).json({ 
            message: 'Post creado con éxito.',
            post: result.rows[0] 
        });
    } catch (error) {
        console.error('Error al crear post:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// 4. GET /health (Health check) - ANTES /api/health
app.get('/health', async (req, res) => {
    
    // Chequeo de Redis (síncrono y rápido)
    const redisStatus = redisClient.isReady ? 'UP' : 'DOWN';

    // Chequeo de DB (Asíncrono y robusto: intenta una conexión real)
    let dbStatus = 'DOWN';
    try {
        const client = await dbPool.connect(); // Intenta obtener una conexión del pool
        // Ejecuta una consulta simple para verificar que la DB responde
        await client.query('SELECT 1'); 
        client.release(); // Libera la conexión
        dbStatus = 'UP';
    } catch (error) {
        console.error('❌ Fallo la prueba de conexión a PostgreSQL:', error.message);
        dbStatus = 'DOWN';
    }
    
    // Respuesta final
    if (dbStatus === 'UP' && redisStatus === 'UP') {
        return res.status(200).json({ 
            status: 'UP', 
            service: 'Backend API',
            db: dbStatus,
            redis: redisStatus
        });
    } else {
        res.status(503).json({ 
            status: 'DOWN', 
            service: 'Backend API',
            db: dbStatus,
            redis: redisStatus
        });
    }
});


// Iniciar el servidor después de la inicialización de recursos
// Usamos la función robusta con reintentos
initWithRetries().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servicio de Posts corriendo en http://localhost:${PORT}`);
    });
});
