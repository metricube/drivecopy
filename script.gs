
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


function startCopy(sourceid) {
  source = DriveApp.getFolderById(sourceid)
  
  // Create the target folder
  root = DriveApp.getRootFolder();
  var d = new Date();
  target = root.createFolder('Backup on ' + d.toLocaleString());
  
  // Copy the top level files
  copyFiles(source, target)
  
  // Now set the subdirectories to process
  var subfolders = source.getFolders()
  var continuationToken = subfolders.getContinuationToken();
  
  var userProperties = PropertiesService.getUserProperties();
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
  var lastTargetFolderCreatedId = userProperties.getProperty('COPY_FILES_LAST_TARGET_FOLDER_ID');
  var baseTargetFolderId = userProperties.getProperty('COPY_FILES_BASE_TARGET_FOLDER_ID');
  var dir;
  var newdir;
 
  // Remove any partially copied directories
  if(lastTargetFolderCreatedId != null) {     
    var partialdir = DriveApp.getFolderById(lastTargetFolderCreatedId);
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

  while(subfolders.hasNext()) {    
    var continuationToken = subfolders.getContinuationToken();
    userProperties.setProperty('COPY_FILES_CONTINUATION_TOKEN', continuationToken);    

    dir = subfolders.next();
    newdir = dfolder.createFolder(dir.getName());
    Logger.log("Recursing in to " + dir.getName());
    
    userProperties.setProperty('COPY_FILES_LAST_TARGET_FOLDER_ID', newdir.getId());
    copyFolder(dir, newdir);
  }
  
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

