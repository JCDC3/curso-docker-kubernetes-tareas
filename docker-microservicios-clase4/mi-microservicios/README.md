🌐 Arquitectura de Microservicios: Blog Cacheado

📜 Descripción del Proyecto

Este proyecto implementa una arquitectura de microservicios utilizando Docker Compose para la orquestación. El objetivo es crear un servicio de blog simple que demuestre la funcionalidad clave de la arquitectura moderna, incluyendo un API Gateway, Cache (Redis) y Persistencia (PostgreSQL).

La aplicación permite a los usuarios crear posts. La lista de posts se sirve desde una caché de Redis por 60 segundos, y la caché se invalida inmediatamente cada vez que se crea un nuevo post.

🧱 Arquitectura de la Solución

El sistema se compone de cinco servicios interconectados a través de una red interna de Docker:

Servicio

Tecnología

Puerto Expuesto (Host)

Función Principal

gateway

Nginx

8085

Punto de entrada. Rutea /api al Backend y / al Frontend.

backend

Node.js / Express

(Interno)

Lógica de negocio, maneja Redis y PostgreSQL.

db

PostgreSQL

(Interno)

Base de datos persistente para los posts.

redis

Redis

(Interno)

Capa de caché para la lista de posts.

frontend

HTML/JS/CSS

(Interno)

Interfaz de usuario para crear y ver posts.

Diagrama de Flujo:

El usuario accede al Gateway (:8085).

El Gateway rutea la petición al Frontend o al Backend (/api).

El Backend consulta Redis primero (Cache HIT/MISS).

Si hay MISS, el Backend consulta PostgreSQL.

🚀 Despliegue (Levantando el Sistema)

Asegúrate de estar en el directorio raíz del proyecto (mi-microservicios/) y de que Docker esté corriendo.

1. Reconstrucción y Arranque Total

Para garantizar que todas las correcciones se apliquen (incluido el retry logic), usa la reconstrucción forzada:

docker compose up -d --build --force-recreate


2. Verificación de Estado

Espera unos segundos y verifica que todos los servicios estén en estado Up:

docker compose ps


Resultado Esperado: Todos los servicios (gateway, backend, db, redis, frontend) deben estar en estado Up o Up (healthy).

🔬 Plan de Pruebas y Verificación Funcional

La aplicación se sirve en el puerto 8085. La clave es demostrar que la caché y la persistencia funcionan.

A. Health Checks y Acceso

Acceso a la Aplicación: Abre http://localhost:8085/.

Health Check del Gateway: Abre http://localhost:8085/gateway/health.

Resultado: Gateway is UP and running.

Health Check del Backend (Crucial): Abre http://localhost:8085/api/health.

Resultado: El JSON debe mostrar: status: UP, db: UP, y redis: UP.

B. Pruebas de Caché y Persistencia

Prueba 1: Demostrar Cache MISS (Consulta a la DB)

Acción: Consulta la lista de posts (refresca http://localhost:8085/ o usa curl http://localhost:8085/api/posts).

Verificación de Logs: Ejecuta docker compose logs backend.

Resultado a Documentar: El log debe mostrar el mensaje:

🐌 Cache MISS para /posts. Consultando DB.


Prueba 2: Demostrar Cache HIT (Respuesta de Redis)

Acción: Repite la consulta (refresca la página) inmediatamente después de la Prueba 1.

Verificación de Logs: Ejecuta docker compose logs backend.

Resultado a Documentar: El log debe mostrar el mensaje:

⚡️ Cache HIT para /posts


Prueba 3: Demostrar Invalidación de Caché

Acción: Crea un nuevo post desde la interfaz web.

Verificación de Logs: Ejecuta docker compose logs backend.

Resultado a Documentar: El log debe mostrar el mensaje:

🔥 Cache invalidada tras la creación del post.


Prueba 4: Demostrar Persistencia con PostgreSQL

Acción A (Detener): Detén todo el sistema para simular un reinicio:

docker compose down


Acción B (Reiniciar): Vuelve a iniciar el sistema:

docker compose up -d


Verificación: Abre http://localhost:8085/.

Resultado a Documentar: El post creado antes de detener los servicios debe seguir visible, probando la persistencia de datos.

🗑️ Limpieza

Para detener y eliminar todos los contenedores y redes (manteniendo los datos de PostgreSQL):

docker compose down


Para detener y eliminar todo (incluyendo los datos de PostgreSQL):

docker compose down -v
