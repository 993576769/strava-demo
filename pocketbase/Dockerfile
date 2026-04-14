FROM ghcr.io/muchobien/pocketbase:latest

WORKDIR /pb

COPY pocketbase/pb_hooks ./pb_hooks
COPY pocketbase/pb_migrations ./pb_migrations

EXPOSE 8090

CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
