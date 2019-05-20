//Make some fourCC keys human readable
const translations = {
  SIUN: 'units',
  UNIT: 'units',
  STNM: 'name',
  RMRK: 'comment'
};

//Ignore some, for now
const ignore = ['EMPT', 'TSMP', 'TICK', 'TOCK'];

//Make some fourCC keys sticky and human readable
const stickyTranslations = {
  TMPC: 'temperature',
  GPSF: 'fix',
  GPSP: 'precision',
  TIMO: 'offset'
};

//Compare equality of values, including objects
function deepEqual(a, b) {
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return a === b;
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (let i = 0; i < Object.keys(a).length; i++) if (!deepEqual(a[Object.keys(a)[i]], b[Object.keys(a)[i]])) return false;
  return true;
}

//Merges all samples of every device under the same key
function mergeDEVCs(klv, options) {
  //Will return a list of sensors for a device
  let result = { sensors: {} };

  (klv.DEVC || []).forEach(d => {
    //Remember stickies per sensor, to avoid looping every time
    let stickies = {};
    (d.STRM || []).forEach(s => {
      //We will store the main samples of the nest
      if (s.interpretSamples) {
        const fourCC = s.interpretSamples;

        //Filter out sensors when using the sensor option
        if (options.sensor == null || options.sensor.includes(fourCC)) {
          //Get the array of samples
          let samples = s[fourCC];
          //Delete the samples from the original to avoid duplication
          delete s[fourCC];
          delete s.interpretSamples;

          let sticky = {};
          let description = {};
          //Loop the rest of values
          for (const key in s) {
            //Translate keys to human when necessary
            if (translations[key]) description[translations[key]] = s[key];
            //Make the rest sticky, unless we want to ignore them
            else if (!ignore.includes(key)) sticky[stickyTranslations[key] || key] = s[key];
          }
          //Remember previous sticky values, that's why they're sticky
          sticky = { ...stickies, ...sticky };
          //If repeatSticky, add the sticky values to every sample
          if (options.repeatSticky) samples = samples.map(s => ({ ...s, ...sticky }));
          //If have both samples and stickies
          else if (Object.keys(sticky).length && samples.length) {
            for (let key in sticky) {
              //Save sticky values that have changed, discard the rest
              if (!deepEqual(sticky[key], stickies[key])) {
                samples[0].sticky = samples[0].sticky || {};
                samples[0].sticky[key] = sticky[key];
              }
            }
          }
          //Remember the new sticky values
          stickies = { ...stickies, ...sticky };

          //Use name and units to describe every sample
          if (options.repeatHeaders) {
            let head = [];
            if (description.name) {
              let name = description.name;
              //Get values inside parenthesis, usually units or similar, ofter one per sample value
              let parts = name.match(/.*\((.+?)\).*/);
              if (parts && parts.length) {
                //Remove parenthesis
                name = name.replace(/\((.+?)\)/, '').trim();
                //Take every value inside parenthesis
                parts = parts[1].split(',').map(p => p.trim());
                //Add every part to the name
                head = parts.map(p => `${name} (${p})`);
                //Or just use the name if no parenthesis
              } else head.push(name);
            }

            let units = [];
            if (description.units) {
              if (Array.isArray(description.units)) {
                //Save units as string array
                description.units.forEach((u, i) => {
                  units.push(` (${u})`);
                });
                //Or single value string
              } else units[0] = (units[0] || '') + ` (${description.units})`;
            }

            //Loop through all the names and units
            for (let i = 0; i < Math.max(head.length, units.length); i++) {
              //Repeat elements if not enough iterations
              head[i] = (head[i] || head[0] || '') + (units[i] || units[0] || '');
            }
            //Add the descriptions and values to samples
            samples = samples.map(s => {
              //If no available description, use numbers
              if (Array.isArray(s.value)) s.value.forEach((v, i) => (s[head[i] || head[0] || i] = v));
              else if (head[0]) s[head[0]] = s.value;
              //Delete value key if we solved the situation
              if (head.length) delete s.value;
              return s;
            });
            //Delete names and units, not needed any more
            delete description.units;
            delete description.name;
          }

          //Add samples to sensor entry
          if (result.sensors[fourCC]) result.sensors[fourCC].samples.push(...samples);
          else result.sensors[fourCC] = { samples, ...description };
        }
      }
    });

    //Delete used data
    delete d.DVID;
    delete d.interpretSamples;
    delete d.STRM;

    //Translate top level keys
    for (const key in d) {
      if (translations[key]) result[translations[key]] = d[key];
      else result[key] = d[key];
    }
  });
  return result;
}

module.exports = mergeDEVCs;
