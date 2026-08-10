export type DateOfBirthFieldProps = {
  value: string | null; // ISO yyyy-mm-dd
  onChange: (isoDate: string) => void;
  maxDate?: Date; // defaults to today — can't be born in the future
};
