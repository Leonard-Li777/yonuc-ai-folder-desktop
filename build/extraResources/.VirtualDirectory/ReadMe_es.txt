# Guía del Directorio Virtual

## Descripción General

`.VirtualDirectory` es un directorio virtual generado automáticamente por esta aplicación, utilizado para mostrar la estructura de archivos después de una organización inteligente. Mantiene una correspondencia uno a uno con los archivos del directorio original, pero utiliza un nombramiento inteligente.

## Propósito

El propósito principal de este directorio virtual es permitir a los usuarios previsualizar los resultados de la organización de archivos sin mover o copiar realmente los archivos originales.
Cuando esté satisfecho con el resultado final, puede hacer clic en "Organizar Directorio Real" para organizar el directorio real para que coincida con la estructura de archivos de .VirtualDirectory, y luego esta aplicación eliminará el directorio .VirtualDirectory.

## Principios Técnicos

### Tecnología de Enlaces Duros

Los archivos en el directorio virtual se generan utilizando tecnología de enlaces duros. Los enlaces duros se pueden entender simplemente como referencias o alias de archivos, con las siguientes características:

1. No ocupan espacio adicional en el disco físico
2. Comparten los mismos bloques de datos con el archivo original
3. Las modificaciones a los archivos con enlaces duros se sincronizan con el archivo original
4. Eliminar un archivo con enlace duro no afecta al archivo original
5. Al eliminar el archivo original, es necesario eliminar el archivo con enlace duro (esta aplicación detectará activamente las eliminaciones de archivos en el directorio real y eliminará en consecuencia los archivos con enlaces duros en el directorio virtual.)

### Diferencia con Accesos Directos

Aunque los enlaces duros son similares a los accesos directos en cierta medida, existen diferencias importantes entre ellos:

| Característica | Accesos Directos | Enlaces Duros |
|----------------|------------------|---------------|
| Nivel del Sistema de Archivos | Solo concepto de Windows | Función del sistema de archivos del sistema operativo |
| Espacio Ocupado | Mínimo (solo metadatos) | Sin espacio adicional |
| Eliminar Archivo Original | El acceso directo se vuelve inválido | El enlace duro aún puede acceder al contenido del archivo |
| Modificar Contenido | No afecta al archivo original | Sincronizado en todos los enlaces |
| Soporte entre Volúmenes | Soportado | Limitado al mismo sistema de archivos |