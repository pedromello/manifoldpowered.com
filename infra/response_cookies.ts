import type { NextApiResponse } from "next";

export function appendResponseCookie(res: NextApiResponse, value: string) {
  const previous = res.getHeader("Set-Cookie");
  const values =
    previous === undefined
      ? []
      : Array.isArray(previous)
        ? previous.map(String)
        : [String(previous)];
  // Replace this cookie's previous value in this response, preserving all others.
  const name = value.slice(0, value.indexOf("=") + 1);
  res.setHeader("Set-Cookie", [
    ...values.filter((item) => !item.startsWith(name)),
    value,
  ]);
}
