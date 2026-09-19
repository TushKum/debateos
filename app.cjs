// Startup file for cPanel "Setup Node.js App" (Phusion Passenger), which loads apps with require().
// The app itself is an ES module, so load it with a dynamic import.
import('./src/server.js').catch(err => {
  console.error(err);
  process.exit(1);
});
