# Usamos una imagen base de Nginx
FROM nginx:alpine

# Reemplazamos la configuración por defecto de Nginx con nuestra configuración
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponemos el puerto 80 (interno)
EXPOSE 80

# Comando para iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
