


const infoMessageBox = document.getElementById('info_message_box');
const infoMessage = document.getElementById('info_message');
const currentTheme = localStorage.getItem('theme');

 const splash = document.getElementById('splash_screen');
const appContent = document.getElementById('app_content');
const specialBtnContent = document.getElementById('specials_section')


window.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash_screen');
  const appContent = document.getElementById('app_content');

  // If the splash has already been shown this session, bypass everything immediately
  if (sessionStorage.getItem('splashShown') === 'true') {
    if (splash) splash.remove(); // Safely clear splash
    appContent.classList.remove('hidden');
    appContent.style.display = 'block';
    document.body.style.overflow = 'auto';
    return; // 🛑 STOP HERE: Do not set timeouts if already shown
  }

  // FIRST TIME USERS ONLY: Run the timer animations
  setTimeout(() => {
    appContent.classList.remove('hidden');
    appContent.style.display = 'block';
    
    if (splash) {
      splash.classList.add('fade-out');
      
      setTimeout(() => {
        document.body.style.overflow = 'auto';
        splash.remove(); 
        // Save to session memory only AFTER the full splash cycle ends
        sessionStorage.setItem('splashShown', 'true');
      }, 600); 
    }
  }, 1500); 
});





// 1. Check for saved theme preference on page load
if (currentTheme === 'dark') {
  document.body.classList.add('dark-mode');
} else {
  document.body.classList.remove('dark-mode');
}


// 2. Add click event listener to the single button
function bgSwitch() {
  // Toggle the dark mode class on the body
  document.body.classList.toggle('dark-mode');
  
  // 3. Save the current choice permanently in localStorage
  if (document.body.classList.contains('dark-mode')) {
    localStorage.setItem('theme', 'dark');
  } else {
    localStorage.setItem('theme', 'light');
  }
};

function checkInfo(){
  infoMessageBox.classList.toggle('active_info');
  infoMessage.classList.toggle('active_info');
  specialBtnContent.classList.toggle('active_info');
  
}

