/* =========================================
   SAHIL NOTION WIDGETS — CLOCK
   ========================================= */

   const timeElement = document.getElementById("time");
   const dateElement = document.getElementById("date");
   
   
   function updateClock() {
   
     const now = new Date();
   
   
     /* ---------- TIME ---------- */
   
     const time = now.toLocaleTimeString("en-IN", {
       hour: "2-digit",
       minute: "2-digit",
       second: "2-digit",
       hour12: false
     });
   
   
     /* ---------- DATE ---------- */
   
     const date = now.toLocaleDateString("en-IN", {
       weekday: "long",
       day: "numeric",
       month: "long",
       year: "numeric"
     });
   
   
     /* ---------- UPDATE DOM ---------- */
   
     timeElement.textContent = time;
   
     dateElement.textContent = date;
   
   }
   
   
   /* ---------- Initial Update ---------- */
   
   updateClock();
   
   
   /* ---------- Update Every Second ---------- */
   
   setInterval(updateClock, 1000);