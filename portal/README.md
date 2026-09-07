# Portal de estados de cuenta — Taller 101

Sitio estático (un solo `index.html`). Lee el Firestore de CONTA MASTER en modo
solo lectura con Firebase Auth (correo + PIN de 6 dígitos).

- El acceso de cada cliente se activa desde CONTA MASTER → ficha del cliente → «Portal del cliente».
- Los productos y sus montos se capturan en la ficha del proyecto; cada ingreso se asigna a un producto.
- La etapa de fabricación por producto viene de quell101 (pendiente de conectar).

Deploy: sitio Netlify aparte con base directory `portal/`. Sin build.
