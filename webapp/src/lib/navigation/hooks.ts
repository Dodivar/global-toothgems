import { useBackend } from "./context";

export const useNavigate = () => useBackend().useNavigate();
export const useLocation = () => useBackend().useLocation();
export const useParams = () => useBackend().useParams();
export const useSearchParams = () => useBackend().useSearchParams();
