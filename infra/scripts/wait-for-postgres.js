import { exec } from "node:child_process";

function checkPostgres() {
  exec("docker exec postgres-dev pg_isready --host localhost", handleReturn);

  function handleReturn(error, stdout) {
    process.stdout.write(".");
    if (stdout.search("accepting connections") === -1) {
      setTimeout(checkPostgres, 1000);
      return;
    }

    process.stdout.write("\nPostgres is ready!\n");
  }
}

process.stdout.write("\nWaiting for postgres..");
checkPostgres();
