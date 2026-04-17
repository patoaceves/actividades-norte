# Delta para /api/actividad.js

En tu archivo `api/actividad.js` del repo, busca el objeto `FIELDS` y
agrega estas 2 líneas nuevas al final (antes del cierre `};`):

```js
const FIELDS = {
  idActividad:   'fldzIa1RbjhIBivKF',
  nombre:        'fldvqjXPKFoQXgAMe',
  cuota:         'fldVePGXnIEkMWciI',
  casa:          'fldBg4qtC8fWw9I4n',
  fechaCompleta: 'fldSwY4v4Rhlf2iK3',
  fechaInicio:   'fldu09zPOwDLytAcm',
  fechaFin:      'fld0dIPfVqJPpvQ4H',
  seccion:       'fldXXEE93HzWeMoH1',
  direccion:     'fldUBbL4v6HKXGU1z',   // ← NUEVO
  googleMapsUrl: 'fldjydLIKiXOxvyQE',   // ← NUEVO
};
```

Y en el objeto que se retorna (`res.json({...})` o similar), agrega:

```js
direccion:     fields[FIELDS.direccion]     || '',
googleMapsUrl: fields[FIELDS.googleMapsUrl] || '',
```

Con eso ya queda listo para que la próxima /v/[ID] los consuma.
