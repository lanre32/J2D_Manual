(() => {
  const enter = document.getElementById('enterStudyBtn');
  if (enter) {
    const go = () => {
      window.location.href = 'folders.html';
    };

    enter.addEventListener('click', go);
    enter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }

  const year = document.getElementById('j2dYear');
  if (year) year.textContent = String(new Date().getFullYear());
})();
