// https://github.com/metricube/drivecopy/blob/master/script.gs

// This code copies a directory tree.  It maintains
// its progress only in the top level tree - so if there
// are too many files in any subfolder of the top level tree
// the script may not complete.


// Web handler to kick things off
 function doGet() {
   var app = UiApp.createApplication();
   var form = app.createFormPanel();
   var flow = app.createFlowPanel();
   flow.add(app.createTextBox().setName("textBox"));
   flow.add(app.createSubmitButton("Copy"));
   form.add(flow);
   app.add(form);
   return app;
 }

 function doPost(eventInfo) {
   var app = UiApp.getActiveApplication();
   app.add(app.createLabel("Starting copy ..."));
   startCopy(eventInfo.parameter.textBox);
   return app;
 }

function reset() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteAllProperties();
  removeTriggers();
  Logger.clear();
}

function initializeManually() {
  reset();
  // set this to the source id and then run
  startCopy('xyzzy');
}

function startCopy(sourceid) {
  source = DriveApp.getFolderById(sourceid);
  
  var userProperties = PropertiesService.getUserProperties();
  
  // clear prior state
  userProperties.deleteAllProperties();
  removeTriggers();
  
  // Create the target folder
  root = DriveApp.getRootFolder();
  var d = new Date();
  target = root.createFolder('Backup on ' + d.toLocaleString());
  
  // Copy the top level files
  copyFiles(source, target)
  
  // Now set the subdirectories to process
  var subfolders = source.getFolders()
  var continuationToken = subfolders.getContinuationToken();
  
  userProperties.setProperty('COPY_FILES_CONTINUATION_TOKEN', continuationToken);
  userProperties.setProperty('COPY_FILES_BASE_TARGET_FOLDER_ID', target.getId());
  
 // Set the trigger to start after 20 seconds - will allow the webapp portion to complete
 ScriptApp.newTrigger("resume")
   .timeBased()
   .after(20000)
   .create();
};


// Copies the files from sfolder to dfolder
function copyFiles(sfolder, dfolder) {
  var files = sfolder.getFiles();
  var file;
  var fname;

  while(files.hasNext()) {
    file = files.next();
    fname = file.getName();
    Logger.log("Copying " + fname);
    file.makeCopy(fname, dfolder);
  }
};


// Copies the files and folders
function copyFolder(sfolder, dfolder) {
  var dir;
  var newdir;
  
  copyFiles(sfolder, dfolder)
  
  var dirs = sfolder.getFolders();
  while(dirs.hasNext()) {
    dir = dirs.next();
    newdir = dfolder.createFolder(dir.getName());
    Logger.log("Recursing in to " + dir.getName());
    copyFolder(dir, newdir);
  }
};


// Resume the copy
function resume(e) {
  
  var userProperties = PropertiesService.getUserProperties();
  var continuationToken = userProperties.getProperty('COPY_FILES_CONTINUATION_TOKEN');
  var continuationId = userProperties.getProperty('COPY_FILES_CONTINUATION_ID');
  var lastTargetFolderCreatedId = userProperties.getProperty('COPY_FILES_LAST_TARGET_FOLDER_ID');
  var baseTargetFolderId = userProperties.getProperty('COPY_FILES_BASE_TARGET_FOLDER_ID');
  var dir;
  var newdir;
 
  // Remove any partially copied directories
  if(lastTargetFolderCreatedId != null) {     
    var partialdir = DriveApp.getFolderById(lastTargetFolderCreatedId);
    Logger.log("Trashing partial folder " + lastTargetFolderCreatedId);
    partialdir.setTrashed(true);
  }
  
  // Clear any existing triggers
  removeTriggers();
  
  // We're finished
  if(continuationToken == null) {
   return null; 
  }
  
 // Install a trigger in case we timeout or have a problem
 ScriptApp.newTrigger("resume")
   .timeBased()
   .after(7 * 60 * 1000)
   .create();  

  var subfolders = DriveApp.continueFolderIterator(continuationToken);
  var dfolder = DriveApp.getFolderById(baseTargetFolderId);
  
  // fast forward subfolders iterator until it catches up with where it last was
  while (continuationId != null && subfolders.hasNext()) {
    dir = subfolders.next();
    if (dir.getId() == continuationId) {
      // we've caught up to the last fully processed folder, continue normally
      Logger.log('Caught up to continuation point');
      break;
    } else {
      Logger.log('Skipping forwards past ' + dir.getName());
    }
  }

  while(subfolders.hasNext()) {
    // capture the continuation state from just before the folder we process
    // instead of after ... so that we can be safe against the iterator bug we work around getting fixed
    var continuationToken = subfolders.getContinuationToken();

    dir = subfolders.next();
    newdir = dfolder.createFolder(dir.getName());
    Logger.log("Recursing in to " + dir.getName());
    
    userProperties.setProperty('COPY_FILES_LAST_TARGET_FOLDER_ID', newdir.getId());
    copyFolder(dir, newdir);
    
    // finished a folder, save state and restart in 1 minute on next folder
    removeTriggers();
    ScriptApp.newTrigger("resume")
      .timeBased()
      .after(60 * 1000)
      .create();
    // don't update the continuation token here, in case it starts working properly,
    // then our bug workaround would break things
    var continuationId = dir.getId();
    userProperties.deleteProperty('COPY_FILES_LAST_TARGET_FOLDER_ID');
    userProperties.setProperty('COPY_FILES_CONTINUATION_TOKEN', continuationToken);
    userProperties.setProperty('COPY_FILES_CONTINUATION_ID', continuationId);
    Logger.log('All set for continuation run');
    return;
  }
  
  Logger.log('Done with everything, cleaning up and sending mail');
  
  // Clean up - we're done
  userProperties.deleteAllProperties();
  removeTriggers();
  
  // Send confirmation mail
  var email = Session.getActiveUser().getEmail();
  MailApp.sendEmail(email, "Copy complete",
                   "The Google Drive folder copy has completed.");    
  
};

function removeTriggers() {
  var allTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < allTriggers.length; i++) {
      ScriptApp.deleteTrigger(allTriggers[i]);
    }   
};

