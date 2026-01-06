function status(req: any, res: any) {
  res.status(200).json({ status: "Index API is running smoothly." });
}

export default status;
