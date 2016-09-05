const _ = require('lodash');
const os = require('os');
const fs = require('fs');
const path = require('path');
const xdg = require('xdg-basedir');
const parser = require('xdg-parse');

const SUPPORTED_PLATFORMS = [
  'linux'
];


const readXdrFile = (file) => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, { encoding: 'utf8' }, (err, content) => {
      if (err) {
        return reject(err);
      }

      const desktopEntry = parser(content)['Desktop Entry'];

      if (!desktopEntry) {
        return resolve(false);
      }

      const result = {
        name: desktopEntry.Name,
        comment: desktopEntry.Comment,
        exec: desktopEntry.Exec,
        type: desktopEntry.Type,
        terminal: desktopEntry.Terminal,
        icon: desktopEntry.Icon
      };

      resolve(result);
    });
  });
};

/**
 * [readXdrDir description]
 * @param  {[type]} directory [description]
 * @return {[type]}           [description]
 */
const readXdrDir = (directory) => {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, (err, files) => {
      if (err) {
        return resolve(false);
      }

      const filePattern = '.*\.desktop$';
      const regEx = new RegExp(filePattern, 'i');

      // We only care about XDG .desktop files
      files = files.filter(file => {
        return regEx.test(file);
      });

      Promise.all(files.map(file => readXdrFile(path.join(directory, file))))
        .then(apps => {

          apps = apps.filter(app => {
            return app.name && app.comment && app.exec && app.type === 'Application';
          });

          resolve(apps);
        });
    });
  });
};


/**
 * [getXdrDirs description]
 * @return {[type]} [description]
 */
const getXdrDirs = () => {
  const localPath = 'applications';

  return xdg['dataDirs'].map(dir => {
    return path.join(dir, localPath);
  });
};

/**
 * Return all applications that can be found through XDR desktop files.
 *
 * @return {[type]} [description]
 */
const getXdrApps = () => {
  const appDirs = getXdrDirs();

  return Promise.all(appDirs.map(dir => {
    return readXdrDir(dir);
  }))
    .then(apps => {
      apps = _.flatten(apps);

      return _.uniqBy(apps, app => {
        return app.name;
      })
    })
};

/**
 * Get the platform.
 */
const getPlatform = () => {
    const platform = os.platform();

    return (SUPPORTED_PLATFORMS.indexOf(platform) >= 0) ? platform : undefined;
};

/**
 * [getApps description]
 * @return {[type]} [description]
 */
const getApps = () => {
  const platform = getPlatform();

  if (platform === undefined) {
    return Promise.reject(new Error('Platform not yet supported'));
  }

  if (platform === 'linux') {
    return getXdrApps();
  }
};

/**
 * [filterApps description]
 * @param  {[type]} apps [description]
 * @param  {[type]} q    [description]
 * @return {[type]}      [description]
 */
const filterApps = (apps, q) => {
  const pattern = '^.*(' + q + ').*$';
  const regEx = new RegExp(pattern, 'i');

  return apps.filter(app => {
    return regEx.test(app.name) || regEx.test(app.comment);
  })
};

module.exports = {
  keyword: 'app',
  action: 'openurl',
  helper: {
    title: 'Search for local applications',
    subtitle: 'Example: app xterm'
  },
  execute: q => new Promise(resolve => {
    getApps()
      .then(result => {
        const items = filterApps(result, q).map(app => Object.assign({}, {
          title: app.name,
          subtitle: app.comment,
          arg: app.exec
        }));

        resolve({ items });
      })
      .catch(err => {
        resolve({ item: 'Error', subtitle: err.message });
      });
  })
};
