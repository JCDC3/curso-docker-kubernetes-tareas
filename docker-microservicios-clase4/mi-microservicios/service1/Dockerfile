# imagen base de Node.js
FROM node:20-alpine

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de configuración y dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto de la aplicación (interno)
EXPOSE 5000

# Comando para iniciar la aplicación
CMD [ "npm", "start" ]
