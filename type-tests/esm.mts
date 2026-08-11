import ky from "ky";
import { RequestManager, type KyRequestOptions } from "pawplacer-sdk";

const requestOptions: KyRequestOptions = { retry: { limit: 1 } };
const requests = new RequestManager(ky, null);

void requestOptions;
void requests;
