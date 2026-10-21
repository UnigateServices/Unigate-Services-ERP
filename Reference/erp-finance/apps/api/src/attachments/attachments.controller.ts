import {
  ArgumentsHost,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { MulterError, memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AttachmentsService, IncomingFile } from './attachments.service';

@Catch(MulterError, PayloadTooLargeException)
class AttachmentUploadFilter implements ExceptionFilter {
  catch(exception: MulterError | PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const multerCode = exception instanceof MulterError ? exception.code : 'LIMIT_FILE_SIZE';
    const code =
      multerCode === 'LIMIT_FILE_SIZE'
        ? 'FILE_TOO_LARGE'
        : multerCode === 'LIMIT_FILE_COUNT'
          ? 'TOO_MANY_FILES'
          : 'FILE_REQUIRED';
    response.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, code, message: code });
  }
}

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(AttachmentUploadFilter)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':reference')
  list(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.attachments.list(user, reference);
  }

  @Post(':reference')
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: Math.ceil(4.5 * 1024 * 1024) },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @UploadedFiles() files: IncomingFile[],
  ) {
    return this.attachments.upload(user, reference, files || []);
  }

  @Get(':reference/:id')
  file(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('id') id: string,
  ) {
    return this.attachments.file(user, reference, id);
  }

  @Delete(':reference/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Param('id') id: string,
  ) {
    return this.attachments.remove(user, reference, id);
  }
}
