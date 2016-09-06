const _ = require('lodash');
const os = require('os');
const fs = require('fs');
const path = require('path');
const xdg = require('xdg-basedir');
const parser = require('xdg-parse');
const which = require('which');

const SUPPORTED_PLATFORMS = [
  'linux'
];


/**
 * [getCommand description]
 * @param  {[type]} exec [description]
 * @return {[type]}      [description]
 */
const getCommand = (exec) => {
  var fullCommand = exec;
  var resolved;

  if (!fullCommand) {
    return undefined;
  }

  // Remove the field code
  fullCommand = fullCommand.trim().replace(/\s%[a-zA-Z]/, '');

  var commandParts = fullCommand.split(' ');

  // No command found
  if (commandParts.length < 1) {
    return undefined;
  }

  // Find the absolute path
  try {
    commandParts[0] = which.sync(commandParts[0]);
  } catch (e) {
    return undefined;
  }

  return commandParts.join(' ');
};


/**
 * [getXdgAppIcon description]
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
const getXdgAppIcon = (icon) => {
  var result;

  if (!icon) {
    return '';
  }

  if (path.isAbsolute(icon)) {
    result = icon;
  }

  if (result) {
    console.log(result);
  }

  // TODO: Handle relative paths

  return result;
};


/**
 * [filterXdgApp description]
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
const filterXdgApp = (app) => {
  return app.name &&
          app.description &&
          app.exec &&
          !app.terminal &&
          app.type === 'Application';
};

/**
 * [readXdgFile description]
 * @param  {[type]} file [description]
 * @return {[type]}      [description]
 */
const readXdgFile = (file) => {
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
        description: desktopEntry.Comment,
        exec: getCommand(desktopEntry.Exec),
        type: desktopEntry.Type,
        terminal: desktopEntry.Terminal ? desktopEntry.Terminal === 'true' : false,
        icon: getXdgAppIcon(desktopEntry.Icon)
      };

      resolve(result);
    });
  });
};


/**
 * [readXdgDir description]
 * @param  {[type]} directory [description]
 * @return {[type]}           [description]
 */
const readXdgDir = (directory) => {
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

      Promise.all(files.map(file => readXdgFile(path.join(directory, file))))
        .then(resolve);
    });
  });
};


/**
 * [getXdgDirs description]
 * @return {[type]} [description]
 */
const getXdgDirs = () => {
  const localPath = 'applications';

  return xdg['dataDirs'].map(dir => {
    return path.join(dir, localPath);
  });
};


/**
 * Return all applications that can be found through XDG desktop files.
 *
 * @return {[type]} [description]
 */
const getXdgApps = () => {
  const appDirs = getXdgDirs();

  return Promise.all(appDirs.map(dir => {
    return readXdgDir(dir);
  }))
    .then(apps => {
      return _.chain(apps)
        .flatten()
        .filter(filterXdgApp)
        .uniqBy(app => app.name)
        .sortBy('name')
        .value();
    });
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
    return getXdgApps();
  }
};


/**
 * [queryApps description]
 * @param  {[type]} apps [description]
 * @param  {[type]} q    [description]
 * @return {[type]}      [description]
 */
const queryApps = (apps, q) => {
  const pattern = '^.*(' + q + ').*$';
  const regEx = new RegExp(pattern, 'i');

  return apps.filter(app => {
    return regEx.test(app.name) || regEx.test(app.description);
  })
};


module.exports = {
  keyword: 'app',
  action: 'openlocal',
  helper: {
    title: 'Search for local applications',
    subtitle: 'Example: app xterm'
  },
  execute: q => new Promise(resolve => {
    getApps()
      .then(result => {
        const items = queryApps(result, q).map(app => Object.assign({}, {
          title: app.name,
          subtitle: app.description,
          arg: app.exec,
          icon: {
            path: app.icon
          }
        }));

        resolve({ items });
      })
      .catch(err => {
        resolve({ item: 'Error', subtitle: err.message });
      });
  })
};
