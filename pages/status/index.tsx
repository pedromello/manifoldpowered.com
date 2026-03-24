import useSWR from "swr";

const fetchAPI = async (key: string) => {
  const response = await fetch(key);
  const responseBody = await response.json();
  return responseBody;
};

const StatusPage = () => {
  return (
    <>
      <h1>Status</h1>
      <UpdatedAt />

      <h2>Database</h2>
      <DatabaseStatus />
    </>
  );
};

const UpdatedAt = () => {
  const { data, error } = useSWR("/api/v1/status", fetchAPI, {
    refreshInterval: 2000,
  });

  let updatedAtText = "Loading...";

  if (data) {
    updatedAtText = new Date(data.updated_at).toLocaleString();
  }

  if (error) {
    updatedAtText = "Error";
  }

  return (
    <>
      <p>Last updated at: {updatedAtText}</p>
    </>
  );
};

const DatabaseStatus = () => {
  const { data, error, isLoading } = useSWR("/api/v1/status", fetchAPI, {
    refreshInterval: 2000,
  });

  return (
    <>
      {isLoading && <p>Loading...</p>}
      {error && <p>Error</p>}
      {data && (
        <>
          <p>Version: {data.dependencies.database.version}</p>
          <p>Max connections: {data.dependencies.database.max_connections}</p>
          <p>Open connections: {data.dependencies.database.open_connections}</p>
        </>
      )}
    </>
  );
};

export default StatusPage;
